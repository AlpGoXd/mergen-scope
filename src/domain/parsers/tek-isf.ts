// ============================================================================
// Mergen Scope — Tektronix Internal Save Format Parser (.isf / WFMPRE)
// ============================================================================
// Parses Tektronix .isf files consisting of an ASCII :WFMPRE: (or :WFMOUTPRE:)
// key-value preamble followed by an IEEE-488.2 binary :CURVE #<d><len><bytes>
// payload. Pure domain module with strict untrusted-input bounds checks.
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

const MAX_PREAMBLE_SCAN_BYTES = 8192;

/** Find the byte offset of ":CURVE #" or "CURVE #" inside the leading ASCII preamble. */
function findCurveHash(bytes: Uint8Array): { readonly headerEnd: number; readonly hashOffset: number } | null {
  const limit = Math.min(bytes.byteLength, MAX_PREAMBLE_SCAN_BYTES);
  let text = "";
  for (let i = 0; i < limit; i++) {
    const code = bytes[i] ?? 0;
    if (code === 0) break;
    text += String.fromCharCode(code);
  }
  const match = /(?:^|;|:)\s*:?CURV(?:E)?\s*#/i.exec(text);
  if (!match) return null;
  const hashOffset = match.index + match[0].length - 1;
  return { headerEnd: match.index, hashOffset };
}

function parsePreambleMap(headerText: string): Map<string, string> {
  const map = new Map<string, string>();
  const parts = headerText.split(";");
  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;
    // Strip leading :WFMPRE: / :WFMP: / :WFMOUTPRE: / :WFMO: prefixes.
    const cleaned = part.replace(/^:?(?:WFMP(?:RE)?|WFMO(?:UTPRE)?):/i, "").trim();
    const spaceIdx = cleaned.search(/\s+/);
    if (spaceIdx <= 0) continue;
    const key = cleaned.slice(0, spaceIdx).replace(/^:/, "").toUpperCase();
    let value = cleaned.slice(spaceIdx).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    map.set(key, value);
  }
  return map;
}

function lookup(map: Map<string, string>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const val = map.get(key);
    if (val !== undefined) return val;
  }
  return undefined;
}

function lookupNum(map: Map<string, string>, keys: readonly string[], fallback: number): number {
  const raw = lookup(map, keys);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeUnit(raw: string | undefined, fallback: string | null): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return fallback;
  if (/^hz$/i.test(trimmed)) return "Hz";
  if (/^(?:s|sec|seconds?)$/i.test(trimmed)) return "s";
  if (/^(?:v|volts?)$/i.test(trimmed)) return "V";
  if (/^(?:a|amps?|amperes?)$/i.test(trimmed)) return "A";
  if (/^dbm$/i.test(trimmed)) return "dBm";
  if (/^db$/i.test(trimmed)) return "dB";
  return trimmed;
}

interface TekIsfHeaderInfo {
  readonly headerText: string;
  readonly map: Map<string, string>;
  readonly payloadBytes: number;
  readonly dataOffset: number;
  readonly bytNr: 1 | 2 | 4;
  readonly isUnsigned: boolean;
  readonly isFloat: boolean;
  readonly littleEndian: boolean;
  readonly xIncr: number;
  readonly xZero: number;
  readonly ptOff: number;
  readonly yMult: number;
  readonly yOff: number;
  readonly yZero: number;
  readonly sampleCount: number;
}

function inspectTekIsf(buffer: ArrayBuffer): { readonly ok: true; readonly info: TekIsfHeaderInfo } | { readonly ok: false; readonly error: string } {
  const bytes = new Uint8Array(buffer);
  const curvePos = findCurveHash(bytes);
  if (!curvePos) {
    return { ok: false, error: "Tektronix .isf file is missing its :CURVE # binary block." };
  }

  const headerText = new TextDecoder("latin1").decode(bytes.subarray(0, curvePos.headerEnd));
  const map = parsePreambleMap(headerText);

  const hashOffset = curvePos.hashOffset;
  if (hashOffset + 2 > bytes.byteLength) {
    return { ok: false, error: "Tektronix .isf :CURVE header is truncated." };
  }
  const digitChar = String.fromCharCode(bytes[hashOffset + 1] ?? 0);
  const numDigits = Number(digitChar);
  if (digitChar < "1" || digitChar > "9" || !Number.isInteger(numDigits) || hashOffset + 2 + numDigits > bytes.byteLength) {
    return { ok: false, error: "Invalid IEEE-488.2 block length header in Tektronix .isf file." };
  }
  const lenText = new TextDecoder("latin1").decode(bytes.subarray(hashOffset + 2, hashOffset + 2 + numDigits));
  if (!/^\d+$/.test(lenText)) {
    return { ok: false, error: "Invalid IEEE-488.2 block length digits in Tektronix .isf file." };
  }
  const payloadBytes = Number(lenText);
  const dataOffset = hashOffset + 2 + numDigits;
  if (!Number.isSafeInteger(payloadBytes) || payloadBytes <= 0 || dataOffset + payloadBytes > bytes.byteLength) {
    return { ok: false, error: "Tektronix .isf sample payload exceeds file bounds." };
  }

  const bytNr = lookupNum(map, ["BYT_NR", "BYT_N"], 1);
  if (bytNr !== 1 && bytNr !== 2 && bytNr !== 4) {
    return { ok: false, error: `Unsupported Tektronix .isf byte width (BYT_NR=${bytNr}).` };
  }
  const bnFmt = (lookup(map, ["BN_FMT", "BN_F"]) ?? "RI").toUpperCase();
  const byOr = (lookup(map, ["BY_OR", "BY_O"]) ?? "MSB").toUpperCase();
  const littleEndian = byOr.startsWith("LS");

  const xIncr = lookupNum(map, ["XINCR", "XIN"], Number.NaN);
  const xZero = lookupNum(map, ["XZERO", "XZE"], 0);
  const ptOff = lookupNum(map, ["PT_OFF", "PT_O"], 0);
  const yMult = lookupNum(map, ["YMULT", "YMU"], Number.NaN);
  const yOff = lookupNum(map, ["YOFF", "YOF"], 0);
  const yZero = lookupNum(map, ["YZERO", "YZE"], 0);
  const nrPt = lookupNum(map, ["NR_PT", "NR_P"], 0);

  if (!Number.isFinite(xIncr) || xIncr === 0 || !Number.isFinite(yMult)) {
    return { ok: false, error: "Tektronix .isf preamble is missing valid XINCR or YMULT scaling." };
  }

  const maxAvailable = Math.floor(payloadBytes / bytNr);
  const sampleCount = nrPt > 0 ? Math.min(Math.floor(nrPt), maxAvailable) : maxAvailable;
  if (sampleCount < 2) {
    return { ok: false, error: "Tektronix .isf file has fewer than two sample points." };
  }

  return {
    ok: true,
    info: {
      headerText,
      map,
      payloadBytes,
      dataOffset,
      bytNr,
      isUnsigned: bnFmt === "RP",
      isFloat: bnFmt === "FP" && bytNr === 4,
      littleEndian,
      xIncr,
      xZero,
      ptOff,
      yMult,
      yOff,
      yZero,
      sampleCount,
    },
  };
}

/** Header-only probe returning total sample count without allocating sample arrays. */
export function probeTekIsfPoints(buffer: ArrayBuffer): ScopeProbeResult {
  const inspected = inspectTekIsf(buffer);
  if (!inspected.ok) return { ok: false, error: inspected.error };
  return { ok: true, totalPoints: inspected.info.sampleCount };
}

/** Parse a Tektronix .isf (Internal Save Format) waveform file. */
export function parseTekIsf(
  buffer: ArrayBuffer,
  fileName: string,
  options: BinaryParseOptions = {},
): BinaryParseResult {
  const inspected = inspectTekIsf(buffer);
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

  const view = new DataView(buffer);

  const readSample = (index: number): number => {
    const pos = info.dataOffset + index * info.bytNr;
    if (info.isFloat) return view.getFloat32(pos, info.littleEndian);
    let raw: number;
    if (info.bytNr === 1) raw = info.isUnsigned ? view.getUint8(pos) : view.getInt8(pos);
    else if (info.bytNr === 2) raw = info.isUnsigned ? view.getUint16(pos, info.littleEndian) : view.getInt16(pos, info.littleEndian);
    else raw = info.isUnsigned ? view.getUint32(pos, info.littleEndian) : view.getInt32(pos, info.littleEndian);
    return (raw - info.yOff) * info.yMult + info.yZero;
  };

  const reduced = reduceBinarySeries({
    count: sliceCount,
    xStart: info.xZero + (sliceStart - info.ptOff) * info.xIncr,
    dt: info.xIncr,
    readY: (i) => readSample(sliceStart + i),
    reduction: options.reduction,
  });

  const normalized = normalizeTraceData(reduced.points);
  if (normalized.length < 2) {
    return { ok: false, error: "Tektronix .isf file has no finite waveform data." };
  }

  const wfid = lookup(info.map, ["WFID"]) ?? "";
  const label = wfid.split(",")[0]?.trim() || "CH1";
  const xUnit = normalizeUnit(lookup(info.map, ["XUNIT", "XUN"]), "s") ?? "s";
  const yUnit = normalizeUnit(lookup(info.map, ["YUNIT", "YUN"]), "V");
  const isFrequency = xUnit.toLowerCase() === "hz";
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
    units: { x: xUnit, y: yUnit },
    data: normalized,
  };

  const meta: Record<string, MetadataEntry> = {
    Format: "Tektronix ISF (Internal Save Format)",
    Channel: label,
    Points: String(info.sampleCount),
    Encoding: `${info.isFloat ? "Float" : info.isUnsigned ? "Uint" : "Int"}${info.bytNr * 8} (${info.littleEndian ? "LE" : "BE"})`,
  };
  if (wfid) meta["WFID"] = wfid;
  if (!isFrequency && info.xIncr > 0) meta["Sample Rate"] = { value: 1 / info.xIncr, unit: "Hz" };
  if (reduced.decimationNote) {
    meta["Decimation"] = reduced.decimationNote;
  }

  const dataset = buildSeriesDatasetFromTrace(trace, family);
  const firstSeries = dataset.series[0];
  const displayTraces = firstSeries ? [buildScalarDisplayTraceFromSeriesDataset(dataset, firstSeries, trace)] : [];
  const columnIdentities: ColumnIdentity[] = [{ index: 0, header: label }];

  const summaryText = `${info.headerText.trim()}\n# Binary payload: ${info.payloadBytes} bytes (${info.sampleCount} samples)`;
  const parsed: ParsedFile = {
    format: "tek-isf",
    meta: meta as FileMetadata,
    traces: [trace],
    datasets: [dataset],
    displayTraces,
    columnIdentities,
    rawText: summaryText,
  };
  return { ok: true, parsed, summaryText };
}
