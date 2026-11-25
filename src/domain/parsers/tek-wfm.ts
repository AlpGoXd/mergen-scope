// ============================================================================
// Mergen Scope — Tektronix Reference Waveform Parser (.wfm, WFM#001 / #002 / #003)
// ============================================================================
// Decodes Tektronix oscilloscope reference waveform files (the binary .wfm
// written by TDS/DPO/MSO instruments, format documented in Tektronix manual
// 077-0220-05). The header is walked field by field with a cursor, so the
// per-version layout differences (WFM#002/#003 summary-frame field, WFM#003
// wider user-view point density) are handled in one place.
//
// Scope of this first version: normal YT analog waveforms with SAMPLE storage.
// FastFrame files import frame 1 only. Pure domain module (no React, no DOM)
// with strict untrusted-input bounds checks: every offset and count is
// validated against the file length before it is dereferenced.
// ============================================================================

import type { RawTrace, TraceDomain } from "../../types/trace.ts";
import type { ColumnIdentity, FileMetadata, MetadataEntry, ParsedFile } from "../../types/file.ts";
import { makeTrace } from "../trace-model.ts";
import { buildScalarDisplayTraceFromSeriesDataset, buildSeriesDatasetFromTrace } from "../dataset-builders.ts";
import { incrementFileCounter } from "./rs-dat.ts";
import { normalizeTraceData } from "./helpers.ts";
import { reduceBinarySeries } from "./binary-reduce.ts";
import type { BinaryParseOptions, ScopeProbeResult } from "./binary-reduce.ts";
import type { BinaryParseResult } from "./lecroy-trc.ts";

// ---------------------------------------------------------------------------
// Layout constants (byte sizes of the structures that follow the static header)
// ---------------------------------------------------------------------------

/** Smallest prefix that holds the static file info and the fields read before the dimension tables. */
const MIN_STATIC_BYTES = 0x9c;
/** Explicit dimension description, implicit dimension description, time base, update spec, curve object. */
const EXP_DESC_BYTES = 100;
const IMP_DESC_BYTES = 76;
const TIME_BASE_BYTES = 12;
const UPDATE_SPEC_BYTES = 24;
const CURVE_OBJECT_BYTES = 30;

const DATA_TYPE_VECTOR = 2;

export type TekWfmVersion = 1 | 2 | 3;

/** Byte-level layout of the curve samples, resolved from the explicit-dimension format code. */
type CurveKind = "int16" | "int32" | "uint32" | "fp32" | "fp64" | "uint8" | "int8";

interface CurveFormat {
  readonly kind: CurveKind;
  readonly bytes: 1 | 2 | 4 | 8;
  readonly label: string;
}

/** Walked header positions for one version (absolute byte offsets). */
export interface TekWfmLayout {
  readonly expDim1: number;
  readonly impDim1: number;
  readonly updateSpec1: number;
  readonly curveObject1: number;
  /** End of the header for a single waveform (first FastFrame update spec, or the curve buffer). */
  readonly headerEnd: number;
}

/** Compute the header layout for a WFM version by walking the structure sizes in file order. */
export function tekWfmLayout(version: TekWfmVersion): TekWfmLayout {
  // Version 2 and 3 insert a u16 summary-frame type at 0x09a, which shifts every later offset.
  const expDim1 = version >= 2 ? 0x0a8 : 0x0a6;
  // User view: scale, units[20], offset, point density (u32, f64 in v3), HRef, TrigDelay.
  const userView = version >= 3 ? 60 : 56;
  const expDimBytes = EXP_DESC_BYTES + userView;
  const impDimBytes = IMP_DESC_BYTES + userView;
  const impDim1 = expDim1 + 2 * expDimBytes;
  const timeBases = impDim1 + 2 * impDimBytes;
  const updateSpec1 = timeBases + 2 * TIME_BASE_BYTES;
  const curveObject1 = updateSpec1 + UPDATE_SPEC_BYTES;
  return { expDim1, impDim1, updateSpec1, curveObject1, headerEnd: curveObject1 + CURVE_OBJECT_BYTES };
}

interface TekWfmInfo {
  readonly version: TekWfmVersion;
  readonly versionTag: string;
  readonly littleEndian: boolean;
  readonly label: string;
  readonly format: CurveFormat;
  /** Absolute byte offset of the first user-visible point of frame 1. */
  readonly dataOffset: number;
  /** User-visible points in frame 1. */
  readonly pointCount: number;
  /** Total FastFrame frames in the file (1 for a single waveform). */
  readonly frameCount: number;
  readonly yScale: number;
  readonly yOffset: number;
  readonly yUnit: string | null;
  readonly xScale: number;
  readonly xOffset: number;
  readonly xUnit: string;
  /** Fraction of a sample between the trigger and the first user point, for frame 1. */
  readonly tt: number;
  /** Raw (pre-scaling) values that mark unacquired / over-range / under-range samples. */
  readonly gapMarkers: readonly number[];
  readonly summaryFrame: number;
}

type InspectResult =
  | { readonly ok: true; readonly info: TekWfmInfo }
  | { readonly ok: false; readonly error: string };

function fail(error: string): { readonly ok: false; readonly error: string } {
  return { ok: false, error };
}

/** Decode a NUL-terminated fixed-width ASCII field, keeping printable characters only. */
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

function parseVersion(tag: string): TekWfmVersion | null {
  if (tag === ":WFM#001") return 1;
  if (tag === ":WFM#002") return 2;
  if (tag === ":WFM#003") return 3;
  return null;
}

function resolveCurveFormat(version: TekWfmVersion, code: number): CurveFormat | string {
  switch (code) {
    case 0: return { kind: "int16", bytes: 2, label: "Int16" };
    case 1: return { kind: "int32", bytes: 4, label: "Int32" };
    case 2: return { kind: "uint32", bytes: 4, label: "Uint32" };
    case 3: return "Unsupported Tektronix WFM curve format (unsigned 64-bit integer). Re-save the waveform as 16-bit or 32-bit data.";
    case 4: return { kind: "fp32", bytes: 4, label: "Float32" };
    case 5: return { kind: "fp64", bytes: 8, label: "Float64" };
    default: break;
  }
  if (version >= 3) {
    if (code === 6) return { kind: "uint8", bytes: 1, label: "Uint8" };
    if (code === 7) return { kind: "int8", bytes: 1, label: "Int8" };
    if (code === 8) return "Tektronix WFM file declares an invalid curve format.";
  } else if (code === 6) {
    return "Tektronix WFM file declares an invalid curve format.";
  }
  return `Unsupported Tektronix WFM curve format code (${code}).`;
}

function dataTypeMessage(dataType: number): string {
  switch (dataType) {
    case 0:
    case 1: return "This Tektronix .wfm file holds a scalar measurement, not a waveform.";
    case 4: return "This Tektronix .wfm file is marked invalid (data type INVALID).";
    case 5: return "Tektronix waveform database / pixel map .wfm files are not supported yet.";
    case 6: return "Digital (MSO) Tektronix .wfm waveforms are not supported yet. Save an analog channel instead.";
    default: return `Unsupported Tektronix .wfm data type (${dataType}); only normal YT vector waveforms are supported.`;
  }
}

function storageMessage(storage: number): string {
  switch (storage) {
    case 1: return "Tektronix .wfm min/max (envelope) or interleaved I/Q waveforms are not supported yet. Save the channel as a normal sample waveform.";
    case 2:
    case 3: return "Tektronix .wfm histogram waveforms are not supported yet.";
    case 4:
    case 5: return "Tektronix .wfm row/column-ordered (2D) waveforms are not supported yet.";
    default: return `Unsupported Tektronix .wfm storage type (${storage}); only sample storage is supported.`;
  }
}

/**
 * Read a 4-byte marker slot (NULL / over-range / under-range) as the curve's own type.
 * Tektronix leaves unused markers as all-zero or all-0xFF, and both are legitimate sample
 * values (zero crossing, -1 count), so an unused marker must never create gaps: null here.
 */
function readMarker(view: DataView, offset: number, format: CurveFormat, le: boolean): number | null {
  const width = Math.min(format.bytes, 4);
  let allZero = true;
  let allOnes = true;
  for (let i = 0; i < width; i++) {
    const byte = view.getUint8(offset + i);
    if (byte !== 0) allZero = false;
    if (byte !== 0xff) allOnes = false;
  }
  if (allZero || allOnes) return null;
  let value: number;
  switch (format.kind) {
    case "int8": value = view.getInt8(offset); break;
    case "uint8": value = view.getUint8(offset); break;
    case "int16": value = view.getInt16(offset, le); break;
    case "int32": value = view.getInt32(offset, le); break;
    case "uint32": value = view.getUint32(offset, le); break;
    case "fp32":
    case "fp64": value = view.getFloat32(offset, le); break;
  }
  return Number.isFinite(value) ? value : null;
}

function inspectTekWfm(buffer: ArrayBuffer): InspectResult {
  if (buffer.byteLength < MIN_STATIC_BYTES) {
    return fail("Tektronix .wfm file is truncated (header too short).");
  }
  const view = new DataView(buffer);
  const b0 = view.getUint8(0);
  const b1 = view.getUint8(1);
  if (b0 !== b1 || (b0 !== 0x0f && b0 !== 0xf0)) {
    return fail("Not a Tektronix .wfm file (unknown byte-order marker; expected 0x0F0F or 0xF0F0).");
  }
  // 0x0F0F means little-endian, 0xF0F0 big-endian.
  const le = b0 === 0x0f;

  const versionTag = readAscii(view, 2, 8);
  const version = parseVersion(versionTag);
  if (version === null) {
    return fail(`Unsupported Tektronix WFM version "${versionTag}"; only WFM#001, WFM#002 and WFM#003 are supported.`);
  }

  const layout = tekWfmLayout(version);
  if (buffer.byteLength < layout.headerEnd) {
    return fail("Tektronix .wfm file is truncated (waveform header incomplete).");
  }

  const bytesPerPoint = view.getUint8(0x0f);
  const curveOffset = view.getInt32(0x10, le);
  const label = readAscii(view, 0x28, 32);
  const frameExtra = view.getUint32(0x48, le);
  const setType = view.getInt32(0x4e, le);
  const implicitDims = view.getUint32(0x72, le);
  const explicitDims = view.getUint32(0x76, le);
  const dataType = view.getInt32(0x7a, le);
  const summaryFrame = version >= 2 ? view.getUint16(0x9a, le) : 0;

  if (dataType !== DATA_TYPE_VECTOR) return fail(dataTypeMessage(dataType));
  if (explicitDims < 1 || implicitDims < 1) {
    return fail("Tektronix .wfm file has no explicit or implicit dimension; it is not a YT waveform.");
  }

  // Frame tables: one update spec and one curve object per additional FastFrame frame.
  const frameCount = frameExtra + 1;
  const headerEnd = layout.headerEnd + frameExtra * (UPDATE_SPEC_BYTES + CURVE_OBJECT_BYTES);
  if (headerEnd > buffer.byteLength) {
    return fail(`Tektronix .wfm FastFrame table (${frameCount.toLocaleString("en-US")} frames) exceeds the file size.`);
  }
  if (setType !== 0 && setType !== 1) {
    return fail(`Unsupported Tektronix .wfm waveform set type (${setType}).`);
  }
  if (curveOffset < headerEnd || curveOffset > buffer.byteLength) {
    return fail("Tektronix .wfm curve buffer offset lies outside the file.");
  }

  // Explicit dimension 1 = the vertical (Y) axis.
  const exp = layout.expDim1;
  const yScale = view.getFloat64(exp, le);
  const yOffset = view.getFloat64(exp + 8, le);
  const yUnitText = readAscii(view, exp + 20, 20);
  const formatCode = view.getInt32(exp + 72, le);
  const storage = view.getInt32(exp + 76, le);
  const format = resolveCurveFormat(version, formatCode);
  if (typeof format === "string") return fail(format);
  if (storage !== 0) return fail(storageMessage(storage));
  if (bytesPerPoint !== format.bytes) {
    return fail(`Tektronix .wfm bytes-per-point (${bytesPerPoint}) does not match its ${format.label} curve format (${format.bytes}).`);
  }
  if (!Number.isFinite(yScale) || !Number.isFinite(yOffset)) {
    return fail("Tektronix .wfm vertical scale or offset is not a finite number.");
  }

  // Implicit dimension 1 = the horizontal (X) axis.
  const imp = layout.impDim1;
  const xScale = view.getFloat64(imp, le);
  const xOffset = view.getFloat64(imp + 8, le);
  const xUnitText = readAscii(view, imp + 20, 20);
  if (!Number.isFinite(xScale) || xScale <= 0) {
    return fail("Tektronix .wfm sample interval must be a positive finite number.");
  }
  if (!Number.isFinite(xOffset)) {
    return fail("Tektronix .wfm horizontal offset is not a finite number.");
  }

  // Frame 1: update spec (trigger fraction) and curve object (byte ranges inside the curve buffer).
  const ttRaw = view.getFloat64(layout.updateSpec1 + 4, le);
  const tt = Number.isFinite(ttRaw) ? ttRaw : 0;
  const cur = layout.curveObject1;
  const preStart = view.getUint32(cur + 10, le);
  const dataStart = view.getUint32(cur + 14, le);
  const postStart = view.getUint32(cur + 18, le);
  const postStop = view.getUint32(cur + 22, le);
  if (!(preStart <= dataStart && dataStart <= postStart && postStart <= postStop)) {
    return fail("Tektronix .wfm curve object offsets are out of order (precharge/data/postcharge).");
  }
  if (dataStart % format.bytes !== 0 || postStart % format.bytes !== 0) {
    return fail(`Tektronix .wfm curve data is not aligned to ${format.bytes}-byte points.`);
  }
  if (curveOffset + postStart > buffer.byteLength) {
    return fail("Tektronix .wfm curve data extends past the end of the file.");
  }
  // Only the user-visible span counts; pre/postcharge points are interpolation padding.
  const pointCount = (postStart - dataStart) / format.bytes;
  if (pointCount < 2) {
    return fail("Tektronix .wfm file has fewer than two sample points.");
  }

  const gapMarkers: number[] = [];
  for (const slot of [80, 84, 88]) {
    const marker = readMarker(view, exp + slot, format, le);
    if (marker !== null) gapMarkers.push(marker);
  }

  return {
    ok: true,
    info: {
      version,
      versionTag,
      littleEndian: le,
      label,
      format,
      dataOffset: curveOffset + dataStart,
      pointCount,
      frameCount,
      yScale,
      yOffset,
      yUnit: yUnitText || null,
      xScale,
      xOffset,
      xUnit: xUnitText || "s",
      tt,
      gapMarkers,
      summaryFrame,
    },
  };
}

/** Header-only probe returning frame 1's user-visible point count without decoding samples. */
export function probeTekWfmPoints(buffer: ArrayBuffer): ScopeProbeResult {
  const inspected = inspectTekWfm(buffer);
  if (!inspected.ok) return { ok: false, error: inspected.error };
  return { ok: true, totalPoints: inspected.info.pointCount };
}

function readRaw(view: DataView, pos: number, kind: CurveKind, le: boolean): number {
  switch (kind) {
    case "int8": return view.getInt8(pos);
    case "uint8": return view.getUint8(pos);
    case "int16": return view.getInt16(pos, le);
    case "int32": return view.getInt32(pos, le);
    case "uint32": return view.getUint32(pos, le);
    case "fp32": return view.getFloat32(pos, le);
    case "fp64": return view.getFloat64(pos, le);
  }
}

/** Parse a Tektronix .wfm (WFM#001/002/003) reference waveform. FastFrame files import frame 1 only. */
export function parseTekWfm(
  buffer: ArrayBuffer,
  fileName: string,
  options: BinaryParseOptions = {},
): BinaryParseResult {
  const inspected = inspectTekWfm(buffer);
  if (!inspected.ok) return fail(inspected.error);
  const info = inspected.info;

  const rawStart = options.slice?.start;
  const rawCount = options.slice?.count;
  const sliceStart = rawStart !== undefined && Number.isFinite(rawStart)
    ? Math.max(0, Math.min(info.pointCount, Math.floor(rawStart)))
    : 0;
  const sliceCount = rawCount !== undefined && Number.isFinite(rawCount) && rawCount > 0
    ? Math.min(Math.floor(rawCount), info.pointCount - sliceStart)
    : info.pointCount - sliceStart;
  if (sliceCount < 2) {
    return fail("Selected sample window has fewer than two samples.");
  }

  const view = new DataView(buffer);
  const { kind, bytes } = info.format;
  const gapMarkers = info.gapMarkers;

  const readSample = (index: number): number => {
    const raw = readRaw(view, info.dataOffset + index * bytes, kind, info.littleEndian);
    // Unacquired / over-range / under-range samples become gaps, never zeros.
    if (gapMarkers.length > 0 && gapMarkers.includes(raw)) return Number.NaN;
    return raw * info.yScale + info.yOffset;
  };

  const reduced = reduceBinarySeries({
    count: sliceCount,
    xStart: info.xOffset + (sliceStart + info.tt) * info.xScale,
    dt: info.xScale,
    readY: (i) => readSample(sliceStart + i),
    reduction: options.reduction,
  });

  const normalized = normalizeTraceData(reduced.points);
  if (normalized.length < 2) {
    return fail("Tektronix .wfm file has no finite waveform data.");
  }

  // FastFrame: only frame 1 is imported for now (the other frames' update specs and curve
  // objects follow frame 1 in the header and are not decoded yet).
  const isFastFrame = info.frameCount > 1;
  const frameNote = isFastFrame ? `frame 1 of ${info.frameCount}` : "";
  const baseLabel = info.label || "CH1";
  const label = isFastFrame ? `${baseLabel} (${frameNote})` : baseLabel;

  const isFrequency = info.xUnit.toLowerCase() === "hz";
  const domain: TraceDomain = isFrequency ? "frequency" : "time";
  const family = isFrequency ? "spectrum" : "waveform";
  const fileSerial = incrementFileCounter();
  const prefix = `${fileName.replace(/\.[^.]+$/, "")} `;

  const trace: RawTrace = {
    ...makeTrace(prefix, fileName, label, fileSerial),
    domain,
    family,
    isUniform: reduced.isUniform,
    ...(reduced.envelopeOf !== undefined ? { envelopeOf: reduced.envelopeOf } : {}),
    dn: `${fileName} ${label}`,
    units: { x: info.xUnit, y: info.yUnit },
    data: normalized,
  };

  const endian = info.littleEndian ? "LE" : "BE";
  const meta: Record<string, MetadataEntry> = {
    Format: `Tektronix WFM (${info.versionTag}, ${info.littleEndian ? "little" : "big"}-endian)`,
    Channel: label,
    Points: String(info.pointCount),
    Encoding: `${info.format.label} (${endian})`,
  };
  if (isFastFrame) {
    meta["Frames"] = String(info.frameCount);
    meta["Frame Imported"] = frameNote;
  }
  if (info.summaryFrame === 1) meta["Summary Frame"] = "Average";
  else if (info.summaryFrame === 2) meta["Summary Frame"] = "Envelope";
  if (!isFrequency) meta["Sample Rate"] = { value: 1 / info.xScale, unit: "Hz" };
  if (reduced.decimationNote) meta["Decimation"] = reduced.decimationNote;

  const dataset = buildSeriesDatasetFromTrace(trace, family);
  const firstSeries = dataset.series[0];
  const displayTraces = firstSeries ? [buildScalarDisplayTraceFromSeriesDataset(dataset, firstSeries, trace)] : [];
  const columnIdentities: ColumnIdentity[] = [{ index: 0, header: label }];

  const summaryLines = [
    `Format: Tektronix WFM (${info.versionTag}, ${endian})`,
    `Label: ${label}`,
    `Curve: ${info.format.label}, ${info.pointCount} points`,
    `x0 = ${info.xOffset + info.tt * info.xScale} ${info.xUnit}, dx = ${info.xScale} ${info.xUnit}`,
    `y = raw * ${info.yScale} + ${info.yOffset}${info.yUnit ? ` ${info.yUnit}` : ""}`,
  ];
  if (isFastFrame) {
    summaryLines.push(`FastFrame: imported ${frameNote}; the other ${info.frameCount - 1} frames are not imported yet.`);
  }
  const summaryText = summaryLines.join("\n");

  const parsed: ParsedFile = {
    format: "tek-wfm",
    meta: meta as FileMetadata,
    traces: [trace],
    datasets: [dataset],
    displayTraces,
    columnIdentities,
    rawText: summaryText,
  };
  return { ok: true, parsed, summaryText };
}
