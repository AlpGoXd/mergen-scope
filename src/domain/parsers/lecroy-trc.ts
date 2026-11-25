// ============================================================================
// Mergen Scope — Teledyne LeCroy Binary Waveform Parser (.trc / WAVEDESC)
// ============================================================================
// Parses LECROY_2_3 WAVEDESC binary trace files (with or without an IEEE-488.2
// SCPI prefix before "WAVEDESC"). Pure domain module, strict bounds checks.
// ============================================================================

import type { RawTrace, TraceDomain } from "../../types/trace.ts";
import type { ColumnIdentity, FileMetadata, MetadataEntry, ParsedFile } from "../../types/file.ts";
import { makeTrace } from "../trace-model.ts";
import { buildScalarDisplayTraceFromSeriesDataset, buildSeriesDatasetFromTrace } from "../dataset-builders.ts";
import { incrementFileCounter } from "./rs-dat.ts";
import { normalizeTraceData } from "./helpers.ts";
import { reduceBinarySeries } from "./binary-reduce.ts";
import type { BinaryParseOptions, BinarySampleSlice, ScopeProbeResult } from "./binary-reduce.ts";

export type { BinaryParseOptions, BinarySampleSlice, ScopeProbeResult };

export type BinaryParseResult =
  | { readonly ok: true; readonly parsed: ParsedFile; readonly summaryText: string }
  | { readonly ok: false; readonly error: string };

const MIN_WAVEDESC_BYTES = 346;

function findWavedescOffset(bytes: Uint8Array): number {
  const limit = Math.min(bytes.byteLength - 8, 64);
  const magic = "WAVEDESC";
  for (let offset = 0; offset <= limit; offset++) {
    let ok = true;
    for (let i = 0; i < magic.length; i++) {
      if (bytes[offset + i] !== magic.charCodeAt(i)) { ok = false; break; }
    }
    if (ok) return offset;
  }
  return -1;
}

function readAscii(view: DataView, offset: number, length: number): string {
  const end = Math.min(view.byteLength, offset + length);
  let out = "";
  for (let i = offset; i < end; i++) {
    const code = view.getUint8(i);
    if (code === 0) break;
    if (code >= 0x20 && code <= 0x7e) out += String.fromCharCode(code);
  }
  return out.trim();
}

function sourceChannelLabel(sourceCode: number): string {
  switch (sourceCode) {
    case 0: return "C1";
    case 1: return "C2";
    case 2: return "C3";
    case 3: return "C4";
    default: return "C1";
  }
}

function normalizeUnit(raw: string, fallback: string | null): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  if (/^hz$/i.test(trimmed)) return "Hz";
  if (/^(?:s|sec|seconds?)$/i.test(trimmed)) return "s";
  if (/^(?:v|volts?)$/i.test(trimmed)) return "V";
  if (/^(?:a|amps?|amperes?)$/i.test(trimmed)) return "A";
  if (/^dbm$/i.test(trimmed)) return "dBm";
  if (/^db$/i.test(trimmed)) return "dB";
  return trimmed;
}

interface LeCroyHeaderInfo {
  readonly view: DataView;
  readonly littleEndian: boolean;
  readonly templateName: string;
  readonly commType: number;
  readonly dataOffset: number;
  readonly instrumentName: string;
  readonly startIdx: number;
  readonly sampleCount: number;
  readonly verticalGain: number;
  readonly verticalOffset: number;
  readonly horizInterval: number;
  readonly horizOffset: number;
  readonly vertUnitRaw: string;
  readonly horizUnitRaw: string;
  readonly waveSource: number;
}

function inspectLeCroyTrc(buffer: ArrayBuffer): { readonly ok: true; readonly info: LeCroyHeaderInfo } | { readonly ok: false; readonly error: string } {
  const bytes = new Uint8Array(buffer);
  const base = findWavedescOffset(bytes);
  if (base < 0 || base + MIN_WAVEDESC_BYTES > buffer.byteLength) {
    return { ok: false, error: "LeCroy .trc WAVEDESC header is missing or truncated." };
  }

  const view = new DataView(buffer);
  // COMM_ORDER @ +34: 0 = Big-Endian (HIFIRST), 1 = Little-Endian (LOFIRST).
  const commOrderLE = view.getUint16(base + 34, true);
  const commOrderBE = view.getUint16(base + 34, false);
  const littleEndian = commOrderLE === 1 ? true : commOrderBE === 0 ? false : true;

  const templateName = readAscii(view, base + 16, 16);
  const commType = view.getInt16(base + 32, littleEndian);
  if (commType !== 0 && commType !== 1) {
    return { ok: false, error: `Unsupported LeCroy sample format (COMM_TYPE=${commType}).` };
  }
  const bytesPerPoint = commType === 0 ? 1 : 2;

  const waveDescriptorLen = view.getInt32(base + 36, littleEndian);
  const userTextLen = view.getInt32(base + 40, littleEndian);
  const trigTimeLen = view.getInt32(base + 48, littleEndian);
  const risTimeLen = view.getInt32(base + 52, littleEndian);
  const waveArray1Len = view.getInt32(base + 60, littleEndian);

  if (
    waveDescriptorLen < MIN_WAVEDESC_BYTES
    || userTextLen < 0
    || trigTimeLen < 0
    || risTimeLen < 0
    || waveArray1Len <= 0
  ) {
    return { ok: false, error: "Invalid block lengths in LeCroy WAVEDESC header." };
  }

  const dataOffset = base + waveDescriptorLen + userTextLen + trigTimeLen + risTimeLen;
  if (dataOffset < base || dataOffset + waveArray1Len > buffer.byteLength) {
    return { ok: false, error: "LeCroy waveform data array exceeds file bounds." };
  }

  const instrumentName = readAscii(view, base + 76, 16);
  const waveArrayCount = view.getInt32(base + 116, littleEndian);
  const firstValid = view.getInt32(base + 124, littleEndian);
  const lastValid = view.getInt32(base + 128, littleEndian);
  const verticalGain = view.getFloat32(base + 156, littleEndian);
  const verticalOffset = view.getFloat32(base + 160, littleEndian);
  const horizInterval = view.getFloat32(base + 176, littleEndian);
  const horizOffset = view.getFloat64(base + 180, littleEndian);
  const vertUnitRaw = readAscii(view, base + 196, 48);
  const horizUnitRaw = readAscii(view, base + 244, 48);
  const waveSource = base + 346 <= buffer.byteLength ? view.getInt16(base + 344, littleEndian) : 0;

  if (!Number.isFinite(verticalGain) || !Number.isFinite(verticalOffset) || !Number.isFinite(horizInterval) || horizInterval === 0 || !Number.isFinite(horizOffset)) {
    return { ok: false, error: "LeCroy scaling parameters are invalid or non-finite." };
  }

  const maxAvailable = Math.floor(waveArray1Len / bytesPerPoint);
  const totalCount = waveArrayCount > 0 ? Math.min(waveArrayCount, maxAvailable) : maxAvailable;
  const startIdx = firstValid >= 0 && firstValid < totalCount ? firstValid : 0;
  const endIdx = lastValid > startIdx && lastValid < totalCount ? lastValid : totalCount - 1;
  const sampleCount = endIdx - startIdx + 1;
  if (sampleCount < 2) {
    return { ok: false, error: "LeCroy .trc file has fewer than two valid sample points." };
  }

  return {
    ok: true,
    info: {
      view,
      littleEndian,
      templateName,
      commType,
      dataOffset,
      instrumentName,
      startIdx,
      sampleCount,
      verticalGain,
      verticalOffset,
      horizInterval,
      horizOffset,
      vertUnitRaw,
      horizUnitRaw,
      waveSource,
    },
  };
}

/** Header-only probe returning total sample count without allocating sample arrays. */
export function probeLeCroyTrcPoints(buffer: ArrayBuffer): ScopeProbeResult {
  const inspected = inspectLeCroyTrc(buffer);
  if (!inspected.ok) return { ok: false, error: inspected.error };
  return { ok: true, totalPoints: inspected.info.sampleCount };
}

/** Parse a Teledyne LeCroy .trc (WAVEDESC / LECROY_2_3) binary trace file. */
export function parseLeCroyTrc(
  buffer: ArrayBuffer,
  fileName: string,
  options: BinaryParseOptions = {},
): BinaryParseResult {
  const inspected = inspectLeCroyTrc(buffer);
  if (!inspected.ok) return { ok: false, error: inspected.error };
  const info = inspected.info;

  const rawStart = options.slice?.start;
  const rawCount = options.slice?.count;
  const sliceStart = rawStart !== undefined && Number.isFinite(rawStart)
    ? Math.max(0, Math.min(info.sampleCount, Math.floor(rawStart)))
    : 0;
  const sliceCount = rawCount !== undefined && Number.isFinite(rawCount) && rawCount > 0
    ? Math.min(Math.floor(rawCount), info.sampleCount - sliceStart)
    : info.sampleCount - sliceStart;
  if (sliceCount < 2) {
    return { ok: false, error: "Selected sample window has fewer than two samples." };
  }
  const winStart = info.startIdx + sliceStart;

  const readSample = (index: number): number => {
    const raw = info.commType === 0
      ? info.view.getInt8(info.dataOffset + index)
      : info.view.getInt16(info.dataOffset + index * 2, info.littleEndian);
    return raw * info.verticalGain - info.verticalOffset;
  };

  const reduced = reduceBinarySeries({
    count: sliceCount,
    xStart: winStart * info.horizInterval + info.horizOffset,
    dt: info.horizInterval,
    readY: (i) => readSample(winStart + i),
    reduction: options.reduction,
  });

  const normalized = normalizeTraceData(reduced.points);
  if (normalized.length < 2) {
    return { ok: false, error: "LeCroy .trc file has no finite waveform data." };
  }

  const xUnit = normalizeUnit(info.horizUnitRaw, "s") ?? "s";
  const yUnit = normalizeUnit(info.vertUnitRaw, "V");
  const isFrequency = xUnit.toLowerCase() === "hz";
  const domain: TraceDomain = isFrequency ? "frequency" : "time";
  const family = isFrequency ? "spectrum" : "waveform";
  const label = sourceChannelLabel(info.waveSource);
  const fileSerial = incrementFileCounter();
  const prefix = `${fileName.replace(/\.[^.]+$/, "")} `;

  const trace: RawTrace = {
    ...makeTrace(prefix, fileName, label, fileSerial),
    domain,
    family,
    isUniform: reduced.isUniform,
    ...(reduced.envelopeOf !== undefined ? { envelopeOf: reduced.envelopeOf } : {}),
    dn: `${fileName} ${label}`,
    units: { x: xUnit, y: yUnit },
    data: normalized,
  };

  const meta: Record<string, MetadataEntry> = {
    Format: `Teledyne LeCroy Binary (${info.templateName || "WAVEDESC"})`,
    Channel: label,
    Points: String(info.sampleCount),
    Encoding: info.commType === 0 ? "Int8" : "Int16",
    "Byte Order": info.littleEndian ? "Little-Endian" : "Big-Endian",
  };
  if (info.instrumentName) meta["Instrument"] = info.instrumentName;
  if (!isFrequency && info.horizInterval > 0) meta["Sample Rate"] = { value: 1 / info.horizInterval, unit: "Hz" };
  if (reduced.decimationNote) {
    meta["Decimation"] = reduced.decimationNote;
  }

  const dataset = buildSeriesDatasetFromTrace(trace, family);
  const firstSeries = dataset.series[0];
  const displayTraces = firstSeries ? [buildScalarDisplayTraceFromSeriesDataset(dataset, firstSeries, trace)] : [];
  const columnIdentities: ColumnIdentity[] = [{ index: 0, header: label }];

  const summaryText = [
    `Format: ${String(meta["Format"])}`,
    ...(info.instrumentName ? [`Instrument: ${info.instrumentName}`] : []),
    `Channel: ${label} · ${info.sampleCount} pts (${info.commType === 0 ? "Int8" : "Int16"}, ${info.littleEndian ? "LE" : "BE"})`,
    `X: offset=${info.horizOffset} ${xUnit}, interval=${info.horizInterval} ${xUnit}`,
    `Y: gain=${info.verticalGain}, offset=${info.verticalOffset} (${yUnit ?? "unitless"})`,
  ].join("\n");

  const parsed: ParsedFile = {
    format: "lecroy-trc",
    meta: meta as FileMetadata,
    traces: [trace],
    datasets: [dataset],
    displayTraces,
    columnIdentities,
    rawText: summaryText,
  };
  return { ok: true, parsed, summaryText };
}
