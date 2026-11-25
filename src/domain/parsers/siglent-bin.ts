// ============================================================================
// Mergen Scope — Siglent SDS Oscilloscope Binary Parser ("Binary Format V4.0")
// ============================================================================
// Decodes the .bin waveform files written by Siglent SDS800X HD, SDS1000X HD,
// SDS2000X HD / Plus, SDS3000X HD, SDS5000X, SDS6000 and SDS7000 scopes, from
// Siglent's application note "How to Extract Data from the Binary File of
// Siglent Oscilloscope" (V4.0 section). The file is a fixed 4 KiB little-endian
// header followed by one sample block per enabled analog channel (CH1..CH8) and
// then one per enabled math trace (F1..F4). Digital channels, which follow, are
// not imported.
//
// Header scalars that carry a unit are "Data With Unit" records: 40 bytes holding
// an f64 value, a magnitude index (8 = unity, 1000x per step) and seven unit
// words. Pure domain module (no React, no DOM) with strict untrusted-input
// bounds checks: every offset, count and scale is validated before use.
// ============================================================================

import type { RawTrace } from "../../types/trace.ts";
import type { ColumnIdentity, FileMetadata, MetadataEntry, ParsedFile } from "../../types/file.ts";
import { makeTrace } from "../trace-model.ts";
import { buildScalarDisplayTraceFromSeriesDataset, buildSeriesDatasetFromTrace } from "../dataset-builders.ts";
import { incrementFileCounter } from "./rs-dat.ts";
import { normalizeTraceData } from "./helpers.ts";
import { reduceBinarySeries } from "./binary-reduce.ts";
import type { BinaryParseOptions, ScopeProbeResult } from "./binary-reduce.ts";
import type { BinaryParseResult } from "./lecroy-trc.ts";

// ---------------------------------------------------------------------------
// Header layout (byte offsets from the start of the file)
// ---------------------------------------------------------------------------

export const SIGLENT_HEADER_BYTES = 0x1000;
const DWU_BYTES = 40;
const MAX_MAGNITUDE = 16;
const MAGNITUDE_UNITY = 8;
const MAX_HORI_DIVS = 1000;

const OFF_VERSION = 0x000;
const OFF_DATA_OFFSET = 0x004;
const OFF_CH_ON = 0x008;
const OFF_CH_ON_5_8 = 0x404;
const OFF_CH_VDIV = 0x018;
const OFF_CH_VDIV_5_8 = 0x414;
const OFF_CH_OFFSET = 0x0b8;
const OFF_CH_OFFSET_5_8 = 0x4b4;
const OFF_DIGITAL_ON = 0x158;
const OFF_DIGITAL_CH_ON = 0x15c;
const OFF_TIME_DIV = 0x19c;
const OFF_TIME_DELAY = 0x1c4;
const OFF_WAVE_LENGTH = 0x1ec;
const OFF_SAMPLE_RATE = 0x1f0;
const OFF_CH_PROBE = 0x244;
const OFF_CH_PROBE_5_8 = 0x554;
const OFF_DATA_WIDTH = 0x264;
const OFF_BYTE_ORDER = 0x265;
const OFF_HORI_DIV_NUM = 0x26c;
const OFF_CH_CODES = 0x270;
const OFF_CH_CODES_5_8 = 0x574;
const OFF_MATH_ON = 0x280;
const OFF_MATH_VDIV = 0x290;
const OFF_MATH_POS = 0x330;
const OFF_MATH_LENGTH = 0x3d0;
const OFF_MATH_INTERVAL = 0x3e0;
const OFF_MATH_CODES = 0x400;
const OFF_ZOOM_SWITCH = 0xaf4;
const OFF_ZOOM_TIME_DIV = 0xaf8;
const OFF_ZOOM_DELAY = 0xb20;

const ANALOG_CHANNELS = 8;
const MATH_TRACES = 4;
const DIGITAL_CHANNELS = 16;

/** One decoded "Data With Unit" record. */
interface Dwu {
  /** Physical value: stored f64 scaled by 1000^(magnitude - 8). */
  readonly value: number;
  readonly units: readonly number[];
}

interface SiglentTraceInfo {
  readonly name: string;
  readonly kind: "analog" | "math";
  /** Absolute byte offset of the first sample. */
  readonly offset: number;
  readonly count: number;
  /** Volts per code step (analog: vdiv * probe / codes-per-div). */
  readonly gain: number;
  /** Subtracted after scaling (analog: offset * probe; math: vertical position). */
  readonly shift: number;
  readonly unit: string | null;
  readonly dt: number;
  readonly detail: string;
}

interface SiglentInfo {
  readonly dataOffset: number;
  readonly bytesPerSample: 1 | 2;
  readonly littleEndian: boolean;
  /** Mid-scale code that maps to zero before the offset. */
  readonly centre: number;
  readonly sampleRate: number;
  readonly timeDiv: number;
  readonly horiDivs: number;
  /** Trigger delay of the main timebase, or the zoom window delay for zoom saves. */
  readonly delay: number;
  readonly zoom: boolean;
  readonly t0: number;
  readonly traces: readonly SiglentTraceInfo[];
  readonly digitalChannels: number;
  readonly unitFallbacks: number;
}

type InspectResult =
  | { readonly ok: true; readonly info: SiglentInfo }
  | { readonly ok: false; readonly error: string };

function fail(error: string): { readonly ok: false; readonly error: string } {
  return { ok: false, error };
}

// ---------------------------------------------------------------------------
// Field readers
// ---------------------------------------------------------------------------

/** Read a Data With Unit record; null when the magnitude index or the value is unusable. */
function readDwu(view: DataView, offset: number): Dwu | null {
  if (offset < 0 || offset + DWU_BYTES > view.byteLength) return null;
  const raw = view.getFloat64(offset, true);
  const magnitude = view.getUint32(offset + 8, true);
  if (!Number.isFinite(raw) || magnitude > MAX_MAGNITUDE) return null;
  const exponent = magnitude - MAGNITUDE_UNITY;
  const value = exponent < 0 ? raw / 1000 ** -exponent : raw * 1000 ** exponent;
  if (!Number.isFinite(value)) return null;
  const units: number[] = [];
  for (let i = 0; i < 7; i++) units.push(view.getUint32(offset + 12 + 4 * i, true));
  return { value, units };
}

const BASIC_UNIT_NAMES: readonly (string | null)[] = [
  null, "dBV", "dBA", "dB", "Vpp", "V", "dBm", "Sa", "div", "pts", null, "°", "%",
];

/**
 * Map unit words to a display unit. Type 0 is composed of V, A and s as numerator/denominator
 * powers (V = 1/1, 0/1, 0/1; A = 0/1, 1/1, 0/1). `known` is false when the words carry no usable information.
 */
function unitFromWords(words: readonly number[]): { readonly unit: string | null; readonly known: boolean } {
  const basic = words[0] ?? 0;
  if (basic !== 0) {
    const name = BASIC_UNIT_NAMES[basic];
    return name === undefined || name === null ? { unit: null, known: false } : { unit: name, known: true };
  }
  const symbols = ["V", "A", "s"] as const;
  const parts: string[] = [];
  let anyWord = false;
  for (let i = 0; i < symbols.length; i++) {
    const num = words[1 + 2 * i] ?? 0;
    const den = words[2 + 2 * i] ?? 0;
    if (num !== 0 || den !== 0) anyWord = true;
    if (num === 0) continue;
    if (den === 0) return { unit: null, known: false };
    const power = num / den;
    const symbol = symbols[i] ?? "V";
    parts.push(power === 1 ? symbol : `${symbol}^${Number(power.toPrecision(3))}`);
  }
  if (!anyWord) return { unit: null, known: false };
  // All powers zero with valid denominators: a dimensionless quantity.
  return { unit: parts.length > 0 ? parts.join("·") : null, known: true };
}

/** Compact number text for metadata and summaries (6 significant digits, no trailing zeros). */
function fmt(value: number): string {
  return String(Number(value.toPrecision(6)));
}

function fmtRate(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${fmt(value / 1e9)} GSa/s`;
  if (abs >= 1e6) return `${fmt(value / 1e6)} MSa/s`;
  if (abs >= 1e3) return `${fmt(value / 1e3)} kSa/s`;
  return `${fmt(value)} Sa/s`;
}

function unitSuffix(unit: string | null): string {
  return unit ? ` ${unit}` : "";
}

/** Read an enable flag that must be 0 or 1. */
function readFlag(view: DataView, offset: number): boolean | null {
  const value = view.getInt32(offset, true);
  if (value === 0) return false;
  if (value === 1) return true;
  return null;
}

// ---------------------------------------------------------------------------
// Header inspection
// ---------------------------------------------------------------------------

function inspectSiglentBin(buffer: ArrayBuffer): InspectResult {
  if (buffer.byteLength < SIGLENT_HEADER_BYTES) {
    return fail(`Siglent .bin file is truncated: the header needs ${SIGLENT_HEADER_BYTES} bytes but the file has ${buffer.byteLength}.`);
  }
  const view = new DataView(buffer);

  const version = view.getUint32(OFF_VERSION, true);
  if (version !== 4) {
    return fail(`Siglent binary format version ${version} is not supported yet; only V4.0 is. Re-save the waveform with a firmware that writes Binary Format V4.0.`);
  }
  const dataOffset = view.getUint32(OFF_DATA_OFFSET, true);
  if (dataOffset < SIGLENT_HEADER_BYTES || dataOffset > buffer.byteLength) {
    return fail(`Siglent .bin data offset (${dataOffset}) lies outside the file (header is ${SIGLENT_HEADER_BYTES} bytes, file is ${buffer.byteLength}).`);
  }

  const widthCode = view.getUint8(OFF_DATA_WIDTH);
  if (widthCode !== 0 && widthCode !== 1) {
    return fail(`Unsupported Siglent data width code (${widthCode}); only 8-bit (0) and 16-bit (1) samples are supported.`);
  }
  const orderCode = view.getUint8(OFF_BYTE_ORDER);
  if (orderCode !== 0 && orderCode !== 1) {
    return fail(`Unsupported Siglent sample byte order code (${orderCode}); expected 0 (LSB first) or 1 (MSB first).`);
  }
  const bytesPerSample: 1 | 2 = widthCode === 1 ? 2 : 1;
  const littleEndian = orderCode === 0;
  const centre = widthCode === 1 ? 32768 : 128;

  const horiDivs = view.getInt32(OFF_HORI_DIV_NUM, true);
  if (horiDivs < 1 || horiDivs > MAX_HORI_DIVS) {
    return fail(`Siglent .bin horizontal division count (${horiDivs}) is not valid.`);
  }
  const zoom = view.getInt32(OFF_ZOOM_SWITCH, true) === 1;

  const sampleRateDwu = readDwu(view, OFF_SAMPLE_RATE);
  if (sampleRateDwu === null) return fail("Siglent .bin sample rate is not a valid number.");
  const sampleRate = sampleRateDwu.value;
  if (!(sampleRate > 0)) return fail("Siglent .bin sample rate must be greater than zero.");

  const timeDivDwu = readDwu(view, zoom ? OFF_ZOOM_TIME_DIV : OFF_TIME_DIV);
  const delayDwu = readDwu(view, zoom ? OFF_ZOOM_DELAY : OFF_TIME_DELAY);
  if (timeDivDwu === null || delayDwu === null) {
    return fail(`Siglent .bin ${zoom ? "zoom " : ""}timebase or trigger delay is not a valid number.`);
  }
  const timeDiv = timeDivDwu.value;
  const delay = delayDwu.value;
  const t0 = zoom
    ? -timeDiv * horiDivs / 2 + delay
    : -timeDiv * horiDivs / 2 - delay;
  if (!Number.isFinite(t0)) return fail("Siglent .bin timebase produces a non-finite start time.");

  const waveLength = view.getUint32(OFF_WAVE_LENGTH, true);

  const traces: SiglentTraceInfo[] = [];
  let unitFallbacks = 0;
  let cursor = dataOffset;
  const room = (count: number): boolean => cursor + count * bytesPerSample <= buffer.byteLength;
  const noFit = (name: string, count: number): ReturnType<typeof fail> =>
    fail(`Siglent .bin sample data does not fit: ${name} needs ${count.toLocaleString("en-US")} samples at byte ${cursor.toLocaleString("en-US")}, but the file is ${buffer.byteLength.toLocaleString("en-US")} bytes.`);

  // Analog channels, CH1..CH8 in order.
  for (let i = 0; i < ANALOG_CHANNELS; i++) {
    const upper = i >= 4;
    const slot = upper ? i - 4 : i;
    const name = `CH${i + 1}`;
    const on = readFlag(view, (upper ? OFF_CH_ON_5_8 : OFF_CH_ON) + 4 * slot);
    if (on === null) return fail(`Siglent .bin ${name} enable flag is not 0 or 1.`);
    if (!on) continue;

    const vdivDwu = readDwu(view, (upper ? OFF_CH_VDIV_5_8 : OFF_CH_VDIV) + DWU_BYTES * slot);
    const offsetDwu = readDwu(view, (upper ? OFF_CH_OFFSET_5_8 : OFF_CH_OFFSET) + DWU_BYTES * slot);
    const probe = view.getFloat64((upper ? OFF_CH_PROBE_5_8 : OFF_CH_PROBE) + 8 * slot, true);
    const codesPerDiv = view.getInt32((upper ? OFF_CH_CODES_5_8 : OFF_CH_CODES) + 4 * slot, true);
    if (vdivDwu === null || !(vdivDwu.value > 0)) return fail(`Siglent .bin ${name} volts/div must be a positive finite number.`);
    if (offsetDwu === null) return fail(`Siglent .bin ${name} vertical offset is not a valid number.`);
    if (!Number.isFinite(probe) || !(probe > 0)) return fail(`Siglent .bin ${name} probe factor must be a positive finite number.`);
    if (codesPerDiv <= 0) return fail(`Siglent .bin ${name} codes per division (${codesPerDiv}) must be positive.`);
    if (waveLength < 2) return fail(`Siglent .bin ${name} has fewer than two samples (wave length ${waveLength}).`);
    if (!room(waveLength)) return noFit(name, waveLength);

    const mapped = unitFromWords(vdivDwu.units);
    let unit = mapped.unit;
    if (!mapped.known) {
      unit = "V";
      unitFallbacks += 1;
    }
    const gain = vdivDwu.value * probe / codesPerDiv;
    const shift = offsetDwu.value * probe;
    if (!Number.isFinite(gain) || !Number.isFinite(shift)) return fail(`Siglent .bin ${name} vertical scale produces a non-finite value.`);
    traces.push({
      name,
      kind: "analog",
      offset: cursor,
      count: waveLength,
      gain,
      shift,
      unit,
      dt: 1 / sampleRate,
      detail: `${fmt(vdivDwu.value * probe)}${unitSuffix(unit)}/div (probe ${fmt(probe)}×), offset ${fmt(shift)}${unitSuffix(unit)}, ${codesPerDiv} codes/div`,
    });
    cursor += waveLength * bytesPerSample;
  }

  // Math traces F1..F4 follow the analog blocks.
  const mathCodes = view.getInt32(OFF_MATH_CODES, true);
  for (let i = 0; i < MATH_TRACES; i++) {
    const name = `F${i + 1}`;
    const on = readFlag(view, OFF_MATH_ON + 4 * i);
    if (on === null) return fail(`Siglent .bin ${name} enable flag is not 0 or 1.`);
    if (!on) continue;

    const vdivDwu = readDwu(view, OFF_MATH_VDIV + DWU_BYTES * i);
    const posDwu = readDwu(view, OFF_MATH_POS + DWU_BYTES * i);
    const length = view.getUint32(OFF_MATH_LENGTH + 4 * i, true);
    const interval = view.getFloat64(OFF_MATH_INTERVAL + 8 * i, true);
    if (vdivDwu === null || !(vdivDwu.value > 0)) return fail(`Siglent .bin ${name} volts/div must be a positive finite number.`);
    if (posDwu === null) return fail(`Siglent .bin ${name} vertical position is not a valid number.`);
    if (mathCodes <= 0) return fail(`Siglent .bin math codes per division (${mathCodes}) must be positive.`);
    if (length < 2) return fail(`Siglent .bin ${name} has fewer than two samples (store length ${length}).`);
    if (!room(length)) return noFit(name, length);

    const mapped = unitFromWords(vdivDwu.units);
    let unit = mapped.unit;
    if (!mapped.known) {
      unit = "V";
      unitFallbacks += 1;
    }
    const gain = vdivDwu.value / mathCodes;
    if (!Number.isFinite(gain)) return fail(`Siglent .bin ${name} vertical scale produces a non-finite value.`);
    const dt = Number.isFinite(interval) && interval > 0 ? interval : 1 / sampleRate;
    traces.push({
      name,
      kind: "math",
      offset: cursor,
      count: length,
      gain,
      shift: posDwu.value,
      unit,
      dt,
      detail: `${fmt(vdivDwu.value)}${unitSuffix(unit)}/div, position ${fmt(posDwu.value)}${unitSuffix(unit)}, ${mathCodes} codes/div`,
    });
    cursor += length * bytesPerSample;
  }

  if (traces.length === 0) {
    return fail("This Siglent .bin file has no enabled analog channel or math trace to import (digital channels are not supported yet).");
  }

  // Digital data follows the analog and math blocks; it is skipped, only counted for the note.
  let digitalChannels = 0;
  if (view.getUint32(OFF_DIGITAL_ON, true) !== 0) {
    for (let i = 0; i < DIGITAL_CHANNELS; i++) {
      if (view.getUint32(OFF_DIGITAL_CH_ON + 4 * i, true) !== 0) digitalChannels += 1;
    }
  }

  return {
    ok: true,
    info: {
      dataOffset,
      bytesPerSample,
      littleEndian,
      centre,
      sampleRate,
      timeDiv,
      horiDivs,
      delay,
      zoom,
      t0,
      traces,
      digitalChannels,
      unitFallbacks,
    },
  };
}

/** Header-only probe returning the largest per-trace point count without decoding samples. */
export function probeSiglentBinPoints(buffer: ArrayBuffer): ScopeProbeResult {
  const inspected = inspectSiglentBin(buffer);
  if (!inspected.ok) return { ok: false, error: inspected.error };
  let totalPoints = 0;
  for (const trace of inspected.info.traces) totalPoints = Math.max(totalPoints, trace.count);
  return { ok: true, totalPoints };
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/** Parse a Siglent SDS oscilloscope .bin file (Binary Format V4.0). Every enabled channel and math trace becomes a trace. */
export function parseSiglentBin(
  buffer: ArrayBuffer,
  fileName: string,
  options: BinaryParseOptions = {},
): BinaryParseResult {
  const inspected = inspectSiglentBin(buffer);
  if (!inspected.ok) return fail(inspected.error);
  const info = inspected.info;

  const view = new DataView(buffer);
  const { bytesPerSample, littleEndian, centre } = info;
  const fileSerial = incrementFileCounter();
  const prefix = `${fileName.replace(/\.[^.]+$/, "")} `;

  const rawStart = options.slice?.start;
  const rawCount = options.slice?.count;

  const traces: RawTrace[] = [];
  const columnIdentities: ColumnIdentity[] = [];
  const summaryLines: string[] = [
    `Format: Siglent SDS Binary V4.0${info.zoom ? " (zoom window)" : ""}`,
    `Samples: ${bytesPerSample * 8}-bit, ${littleEndian ? "LSB first (little-endian)" : "MSB first (big-endian)"}`,
    `Sample rate: ${fmtRate(info.sampleRate)}`,
    `${info.zoom ? "Zoom timebase" : "Timebase"}: ${fmt(info.timeDiv)} s/div × ${info.horiDivs} div, ${info.zoom ? "zoom delay" : "trigger delay"} ${fmt(info.delay)} s`,
  ];
  if (info.zoom) {
    summaryLines.push("Zoom: this file is a zoom-window save; the zoom timebase and delay position the samples.");
  }
  const meta: Record<string, MetadataEntry> = {};
  let maxPoints = 0;
  let decimationNote: string | null = null;

  for (const spec of info.traces) {
    maxPoints = Math.max(maxPoints, spec.count);
    const sliceStart = rawStart !== undefined && Number.isFinite(rawStart)
      ? Math.max(0, Math.min(spec.count, Math.floor(rawStart)))
      : 0;
    const sliceCount = rawCount !== undefined && Number.isFinite(rawCount) && rawCount > 0
      ? Math.min(Math.floor(rawCount), spec.count - sliceStart)
      : spec.count - sliceStart;
    summaryLines.push(`${spec.name}: ${spec.count} pts, ${spec.detail}`);
    meta[spec.name] = `${spec.detail}, ${spec.count} pts`;
    if (sliceCount < 2) continue;

    const readCode = (index: number): number => {
      const pos = spec.offset + (sliceStart + index) * bytesPerSample;
      return bytesPerSample === 2 ? view.getUint16(pos, littleEndian) : view.getUint8(pos);
    };
    const reduced = reduceBinarySeries({
      count: sliceCount,
      xStart: info.t0 + sliceStart * spec.dt,
      dt: spec.dt,
      readY: (i) => (readCode(i) - centre) * spec.gain - spec.shift,
      reduction: options.reduction,
    });
    if (reduced.decimationNote) decimationNote = `${reduced.decimationNote} (per trace)`;

    const normalized = normalizeTraceData(reduced.points);
    if (normalized.length < 2) continue;

    const trace: RawTrace = {
      ...makeTrace(prefix, fileName, spec.name, fileSerial),
      domain: "time",
      family: "waveform",
      isUniform: reduced.isUniform,
      ...(reduced.envelopeOf !== undefined ? { envelopeOf: reduced.envelopeOf } : {}),
      dn: `${fileName} ${spec.name}`,
      units: { x: "s", y: spec.unit },
      data: normalized,
    };
    traces.push(trace);
    columnIdentities.push({ index: traces.length - 1, header: spec.name });
  }

  if (traces.length === 0) {
    return fail("Selected sample window has fewer than two samples.");
  }

  meta["Format"] = `Siglent SDS Binary V4.0 (${bytesPerSample * 8}-bit, ${littleEndian ? "LSB first" : "MSB first"})`;
  meta["Channels"] = String(traces.length);
  meta["Points"] = String(maxPoints);
  meta["Sample Rate"] = { value: info.sampleRate, unit: "Hz" };
  meta["Timebase"] = `${fmt(info.timeDiv)} s/div × ${info.horiDivs} div`;
  meta[info.zoom ? "Zoom Delay" : "Trigger Delay"] = { value: info.delay, unit: "s" };
  meta["Data Width"] = `${bytesPerSample * 8}-bit`;
  meta["Byte Order"] = littleEndian ? "LSB first (little-endian)" : "MSB first (big-endian)";
  if (info.zoom) meta["Zoom"] = "Zoom window save (zoom timebase and delay applied)";
  if (decimationNote) meta["Decimation"] = decimationNote;
  if (info.digitalChannels > 0) {
    meta["Skipped Digital Channels"] = String(info.digitalChannels);
    summaryLines.push(`Digital: ${info.digitalChannels} channel(s) enabled in the file are not imported yet.`);
  }
  if (info.unitFallbacks > 0) {
    meta["Unit Note"] = "Vertical unit not recorded in the file; assumed V";
    summaryLines.push("Unit: the file does not record a vertical unit; assuming V.");
  }

  const datasets = traces.map((trace) => buildSeriesDatasetFromTrace(trace, "waveform"));
  const displayTraces = [];
  for (const [index, trace] of traces.entries()) {
    const dataset = datasets[index];
    const firstSeries = dataset?.series[0];
    if (!dataset || !firstSeries) continue;
    displayTraces.push(buildScalarDisplayTraceFromSeriesDataset(dataset, firstSeries, trace));
  }

  const summaryText = summaryLines.join("\n");
  const parsed: ParsedFile = {
    format: "siglent-bin",
    meta: meta as FileMetadata,
    traces,
    datasets,
    displayTraces,
    columnIdentities,
    rawText: summaryText,
  };
  return { ok: true, parsed, summaryText };
}
