// ============================================================================
// Mergen Scope — Binary Import Wizard Engine (Scope Override + Raw Binary / IQ)
// ============================================================================
// Pure domain module (no React, no DOM) that:
//   1. Re-parses oscilloscope binaries (Keysight AG, Rigol RG, LeCroy .trc,
//      Tektronix .isf, OWON .bin) with explicit parser selection, per-channel
//      enable/unit/scale/offset overrides, X scale/offset, and pre-decimation
//      full-resolution sample slicing.
//   2. Parses headerless raw binary / GNU Radio IQ files (.bin, .cfile, .cf32,
//      .fc32, .sc16, .cs16, .cu8, .iq, .f32, .f64, .i32, .i16, .u8) with
//      configurable datatype, endianness, Real / IQ (with Swap I/Q) /
//      Interleaved / Planar layout, header skip, sample rate, X offset,
//      slice window, SDR presets, and live preview plot.
// ============================================================================

import type { DataPoint, RawTrace } from "../../types/trace.ts";
import type { ColumnIdentity, FileMetadata, MetadataEntry, ParsedFile } from "../../types/file.ts";
import type { ScalarDisplayTrace } from "../../types/display.ts";
import { makeTrace } from "../trace-model.ts";
import { buildScalarDisplayTraceFromSeriesDataset, buildSeriesDatasetFromTrace } from "../dataset-builders.ts";
import { decimateMinMax } from "../trace-math.ts";
import { formatAdaptiveXAxisValue, formatScalarWithUnit } from "../format.ts";
import type { OverviewPlot } from "../import-wizard.ts";
import { PLOT_BUCKETS } from "../import-wizard.ts";
import { incrementFileCounter } from "./rs-dat.ts";
import { normalizeTraceData } from "./helpers.ts";
import { BINARY_SNIFF_BYTES, detectBinarySignature, isStrictRawBinaryExtension, scopeFormatLabel } from "./binary-detect.ts";
import type { BinaryFormat } from "./binary-detect.ts";
import { defaultBinaryReduction, reduceBinarySeries } from "./binary-reduce.ts";
import type { BinaryParseOptions, BinaryReduction, BinarySampleSlice } from "./binary-reduce.ts";
import { parseWavebin } from "./wavebin.ts";
import { parseLeCroyTrc } from "./lecroy-trc.ts";
import { parseTekIsf } from "./tek-isf.ts";
import { parseOwonBin } from "./owon-bin.ts";
import { parseWavBin } from "./wav-bin.ts";
import { parseNpyBin } from "./npy-bin.ts";
import { analyzeDecodedQuality, decodeFloat16, inspectBinaryCursor, readInt24, readUint24 } from "./binary-inspect.ts";
import type { BinaryCursorReadings, BinaryEncodingWarning } from "./binary-inspect.ts";
import type { BinaryParseResult } from "./lecroy-trc.ts";

export { inspectBinaryCursor, isStrictRawBinaryExtension, scopeFormatLabel };
export type { BinaryCursorReadings, BinaryEncodingWarning, BinaryReduction };

export type BinarySampleType = "float32" | "float64" | "float16" | "int32" | "uint32" | "int24" | "uint24" | "int16" | "uint16" | "int8" | "uint8";
export type BinaryEndian = "le" | "be";
export type BinaryChannelLayout = "real" | "iq" | "interleaved" | "planar";
export type BinaryParserChoice = "auto" | BinaryFormat;

export interface BinaryChannelOverride {
  /** false hides/omits this channel; true/undefined includes it. */
  readonly enabled?: boolean;
  /** Per-channel Y unit override (undefined = inherit global/header, "" = unitless). */
  readonly yUnit?: string;
  /** Per-channel vertical scale multiplier (e.g. 10 for a 10x probe on CH1 only). */
  readonly yMult?: number;
  /** Per-channel vertical offset added after scaling. */
  readonly yOffset?: number;
}

export interface BinaryImportConfig {
  /** 'auto-scope' parses via the detected/chosen oscilloscope header with overrides; 'raw' reads raw samples directly. */
  readonly mode: "auto-scope" | "raw";
  /** Explicit scope parser override in auto-scope mode ('auto' uses signature detection). */
  readonly parserOverride?: BinaryParserChoice;
  readonly sampleType: BinarySampleType;
  readonly endian: BinaryEndian;
  readonly layout: BinaryChannelLayout;
  /** Swap I and Q order when layout === 'iq'. */
  readonly swapIQ?: boolean;
  /** Number of channels when layout === 'interleaved' or 'planar' (2..8). */
  readonly channelCount: number;
  /** Leading header bytes to skip in raw mode. */
  readonly headerBytes: number;
  /** Optional trailing padding bytes to skip after each sample frame in raw mode (e.g. timestamps/CRC). */
  readonly framePadBytes?: number;
  /** Optional trailing footer bytes to ignore at end-of-file in raw mode. */
  readonly footerBytes?: number;
  /** Sample rate in Hz in raw mode (<= 0 uses unitless sample index). */
  readonly sampleRateHz: number;
  /** First sample index to import (0-based). */
  readonly startSample: number;
  /** Max samples per channel to import (0 = all available). */
  readonly sampleCount: number;
  /** Sample reduction strategy (defaults to full decode when omitted). */
  readonly reduction?: BinaryReduction;
  /** Optional channel subset in auto-scope mode (undefined = all channels). */
  readonly selectedChannels?: readonly number[];
  /** Per-channel enable, unit, scale and offset overrides in auto-scope mode. */
  readonly channelOverrides?: Readonly<Record<number, BinaryChannelOverride>>;
  /** Global override Y unit (undefined = keep detected unit; "" = unitless). */
  readonly yUnit?: string;
  /** Global vertical scale multiplier (e.g. 10 for a 10x probe). */
  readonly yMult: number;
  /** Global vertical offset added after yMult. */
  readonly yOffset: number;
  /** Horizontal scale multiplier (e.g. 1e-3). */
  readonly xMult: number;
  /** Horizontal trigger/origin offset added after xMult. */
  readonly xOffset?: number;
}

export interface BinaryRawPreset {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly patch: Partial<BinaryImportConfig>;
}

export const BINARY_RAW_PRESETS: readonly BinaryRawPreset[] = [
  {
    id: "gr-cf32",
    label: "GR cf32",
    title: "GNU Radio Complex Float32 LE (I, Q)",
    patch: { mode: "raw", sampleType: "float32", endian: "le", layout: "iq", swapIQ: false, yMult: 1, yOffset: 0 },
  },
  {
    id: "usrp-sc16",
    label: "USRP sc16",
    title: "USRP / BladeRF Signed Int16 LE IQ (normalized ±1)",
    patch: { mode: "raw", sampleType: "int16", endian: "le", layout: "iq", swapIQ: false, yMult: 1 / 32768, yOffset: 0 },
  },
  {
    id: "hackrf-cs8",
    label: "HackRF cs8",
    title: "HackRF Signed Int8 IQ (normalized ±1)",
    patch: { mode: "raw", sampleType: "int8", endian: "le", layout: "iq", swapIQ: false, yMult: 1 / 128, yOffset: 0 },
  },
  {
    id: "rtl-cu8",
    label: "RTL cu8",
    title: "RTL-SDR Unsigned Uint8 IQ ((u8 − 127.5) / 127.5)",
    patch: { mode: "raw", sampleType: "uint8", endian: "le", layout: "iq", swapIQ: false, yMult: 1 / 127.5, yOffset: -1 },
  },
];

const RAW_BINARY_EXT = /\.(?:bin|cfile|cf32|fc32|sc16|cs16|ci16|cu8|cs8|iq|f32|f64|i32|u32|i24|u24|i16|s16|u16|u8|trc|isf|wav|npy|wfm|raw|pcm)$/i;

export interface BinarySettingsProfile {
  readonly kind: "mergen-binary-import-settings";
  readonly version: 1;
  readonly config: BinaryImportConfig;
}

const VALID_SAMPLE_TYPES = new Set<BinarySampleType>(["float32", "float64", "float16", "int32", "uint32", "int24", "uint24", "int16", "uint16", "int8", "uint8"]);
const VALID_LAYOUTS = new Set<BinaryChannelLayout>(["real", "iq", "interleaved", "planar"]);
const VALID_PARSERS = new Set<BinaryParserChoice>(["auto", "wavebin", "lecroy-trc", "tek-isf", "owon-bin", "wav", "npy"]);

/** Serialize a BinaryImportConfig into a portable JSON profile for saving/sharing lab formats. */
export function serializeBinarySettings(config: BinaryImportConfig): string {
  const profile: BinarySettingsProfile = {
    kind: "mergen-binary-import-settings",
    version: 1,
    config,
  };
  return `${JSON.stringify(profile, null, 2)}\n`;
}

/** Validate and parse a saved binary import settings JSON file safely (untrusted input). */
export function parseBinarySettings(
  jsonText: string,
  fallback: BinaryImportConfig,
): { readonly ok: true; readonly config: BinaryImportConfig } | { readonly ok: false; readonly error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "Settings file is not valid JSON." };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Invalid binary settings file." };
  }
  const envelope = raw as Record<string, unknown>;
  const cfg = (envelope["kind"] === "mergen-binary-import-settings" && envelope["config"] && typeof envelope["config"] === "object" && !Array.isArray(envelope["config"]))
    ? (envelope["config"] as Record<string, unknown>)
    : envelope;

  const mode = cfg["mode"] === "auto-scope" || cfg["mode"] === "raw" ? cfg["mode"] : fallback.mode;
  const parserOverride = typeof cfg["parserOverride"] === "string" && VALID_PARSERS.has(cfg["parserOverride"] as BinaryParserChoice)
    ? (cfg["parserOverride"] as BinaryParserChoice)
    : fallback.parserOverride;
  const sampleType = typeof cfg["sampleType"] === "string" && VALID_SAMPLE_TYPES.has(cfg["sampleType"] as BinarySampleType)
    ? (cfg["sampleType"] as BinarySampleType)
    : fallback.sampleType;
  const endian = cfg["endian"] === "le" || cfg["endian"] === "be" ? cfg["endian"] : fallback.endian;
  const layout = typeof cfg["layout"] === "string" && VALID_LAYOUTS.has(cfg["layout"] as BinaryChannelLayout)
    ? (cfg["layout"] as BinaryChannelLayout)
    : fallback.layout;
  const num = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? v : def);
  const nonNegInt = (v: unknown, def: number) => Math.max(0, Math.floor(num(v, def)));

  const yMult = num(cfg["yMult"], fallback.yMult);
  const xMult = num(cfg["xMult"], fallback.xMult);

  return {
    ok: true,
    config: {
      ...fallback,
      mode,
      parserOverride,
      sampleType,
      endian,
      layout,
      swapIQ: typeof cfg["swapIQ"] === "boolean" ? cfg["swapIQ"] : fallback.swapIQ,
      channelCount: Math.max(2, Math.min(8, nonNegInt(cfg["channelCount"], fallback.channelCount))),
      headerBytes: nonNegInt(cfg["headerBytes"], fallback.headerBytes),
      framePadBytes: nonNegInt(cfg["framePadBytes"], fallback.framePadBytes ?? 0),
      footerBytes: nonNegInt(cfg["footerBytes"], fallback.footerBytes ?? 0),
      sampleRateHz: Math.max(0, num(cfg["sampleRateHz"], fallback.sampleRateHz)),
      startSample: nonNegInt(cfg["startSample"], fallback.startSample),
      sampleCount: nonNegInt(cfg["sampleCount"], fallback.sampleCount),
      yUnit: typeof cfg["yUnit"] === "string" ? cfg["yUnit"] : undefined,
      yMult: yMult !== 0 ? yMult : 1,
      yOffset: num(cfg["yOffset"], fallback.yOffset),
      xMult: xMult !== 0 ? xMult : 1,
      xOffset: num(cfg["xOffset"], fallback.xOffset ?? 0),
    },
  };
}

export function isBinaryFileExtension(fileName: string): boolean {
  return RAW_BINARY_EXT.test(fileName);
}

export function sampleTypeBytes(type: BinarySampleType): number {
  switch (type) {
    case "float64": return 8;
    case "float32":
    case "int32":
    case "uint32": return 4;
    case "int24":
    case "uint24": return 3;
    case "float16":
    case "int16":
    case "uint16": return 2;
    case "int8":
    case "uint8": return 1;
  }
}

export function channelsPerFrame(config: Pick<BinaryImportConfig, "layout" | "channelCount">): number {
  if (config.layout === "real") return 1;
  if (config.layout === "iq") return 2;
  return Math.max(2, Math.min(8, Math.floor(Number.isFinite(config.channelCount) ? config.channelCount : 2)));
}

export function rawTotalSamples(
  byteLength: number,
  config: Pick<BinaryImportConfig, "sampleType" | "layout" | "channelCount" | "headerBytes" | "framePadBytes" | "footerBytes">,
): number {
  const skip = Math.max(0, Math.floor(Number.isFinite(config.headerBytes) ? config.headerBytes : 0));
  const footer = Math.max(0, Math.floor(Number.isFinite(config.footerBytes ?? 0) ? (config.footerBytes ?? 0) : 0));
  const pad = Math.max(0, Math.floor(Number.isFinite(config.framePadBytes ?? 0) ? (config.framePadBytes ?? 0) : 0));
  const remaining = Math.max(0, byteLength - skip - footer);
  const frameBytes = sampleTypeBytes(config.sampleType) * channelsPerFrame(config) + (config.layout === "planar" ? 0 : pad);
  return frameBytes > 0 ? Math.floor(remaining / frameBytes) : 0;
}

export interface BinaryDataStartResult {
  readonly offset: number;
  readonly reason: string;
  readonly detected: boolean;
}

/**
 * Heuristic header-end finder for binary files in Custom mode:
 *  - RIFF/WAVE ("RIFF....WAVE") -> past "data" chunk header (+8 B)
 *  - NumPy .npy ("\x93NUMPY") -> past v1/v2/v3 dict header
 *  - Keysight AG / Rigol RG .bin -> CH1 waveform payload start
 *  - Teledyne LeCroy .trc ("WAVEDESC") -> wave array 1 start
 *  - OWON .bin ("SPBXDS") -> CH1 payload past JSON + optional 4 B byte-length prefix
 *  - Tektronix .isf / IEEE 488.2 binary block ("#<d><len>") inside leading ASCII header
 *  - Leading printable ASCII preamble (+ optional trailing NUL padding)
 */
export function detectBinaryDataStart(buffer: ArrayBuffer): BinaryDataStartResult {
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  if (len < 16) return { offset: 0, reason: "File too short for a header", detected: false };

  const view = new DataView(buffer);
  const asciiAt = (pos: number, count: number): string => {
    let out = "";
    for (let i = 0; i < count && pos + i < len; i++) out += String.fromCharCode(bytes[pos + i] ?? 0);
    return out;
  };

  // 1. RIFF / WAVE container ("RIFF....WAVE"): walk chunks until "data".
  if (asciiAt(0, 4) === "RIFF" && asciiAt(8, 4) === "WAVE") {
    let pos = 12;
    while (pos + 8 <= len) {
      const isData = asciiAt(pos, 4) === "data";
      const chunkSize = view.getUint32(pos + 4, true);
      if (isData) {
        const offset = Math.min(len - 1, pos + 8);
        return { offset, reason: 'WAV "data" chunk', detected: true };
      }
      if (chunkSize > len) break;
      pos += 8 + chunkSize + (chunkSize % 2);
    }
  }

  // 2. NumPy .npy ("\x93NUMPY").
  if (bytes[0] === 0x93 && asciiAt(1, 5) === "NUMPY") {
    const major = bytes[6] ?? 0;
    if (major === 1 && len >= 10) {
      const hdrLen = view.getUint16(8, true);
      const offset = 10 + hdrLen;
      if (offset < len) return { offset, reason: "NumPy .npy header", detected: true };
    } else if (major >= 2 && len >= 12) {
      const hdrLen = view.getUint32(8, true);
      const offset = 12 + hdrLen;
      if (offset < len) return { offset, reason: "NumPy .npy header", detected: true };
    }
  }

  // 3. Keysight AG / Rigol RG .bin -> CH1 payload offset.
  const cookie = asciiAt(0, 2);
  if ((cookie === "AG" || cookie === "RG") && /^[0-9]{2}$/.test(asciiAt(2, 2))) {
    const isRigol16 = cookie === "RG" && len >= 20 && view.getUint32(8, true) === 0 && view.getUint32(12, true) > 0 && view.getUint32(12, true) <= 64;
    const fileHdr = isRigol16 ? 16 : 12;
    if (fileHdr + 4 <= len) {
      const wfmHdr = view.getInt32(fileHdr, true);
      if (wfmHdr >= 100 && wfmHdr <= 4096 && fileHdr + wfmHdr + 4 <= len) {
        const dataHdr = view.getInt32(fileHdr + wfmHdr, true);
        if (dataHdr >= 8 && dataHdr <= 64) {
          const offset = fileHdr + wfmHdr + dataHdr;
          if (offset < len) {
            return { offset, reason: cookie === "AG" ? "Keysight AG CH1 payload" : "Rigol RG CH1 payload", detected: true };
          }
        }
      }
    }
  }

  // 4. Teledyne LeCroy .trc ("WAVEDESC" within first 64 bytes).
  const sniffAscii = asciiAt(0, Math.min(len, 64));
  const wdStart = sniffAscii.indexOf("WAVEDESC");
  if (wdStart >= 0 && wdStart + 56 <= len) {
    const le = view.getInt16(wdStart + 34, true) !== 0;
    const wdLen = view.getInt32(wdStart + 36, le);
    const userText = view.getInt32(wdStart + 40, le);
    const trigtime = view.getInt32(wdStart + 48, le);
    const risTime = view.getInt32(wdStart + 52, le);
    if (wdLen >= 346 && userText >= 0 && trigtime >= 0 && risTime >= 0) {
      const offset = wdStart + wdLen + userText + trigtime + risTime;
      if (offset < len) return { offset, reason: "LeCroy WAVEDESC payload", detected: true };
    }
  }

  // 5. OWON .bin ("SPBXDS" + 4 B JSON length + JSON + optional 4 B CH1 byte length).
  if (asciiAt(0, 6) === "SPBXDS" && len >= 14) {
    const jsonLen = view.getUint32(6, true);
    const afterJson = 10 + jsonLen;
    if (jsonLen > 0 && afterJson < len) {
      let offset = afterJson;
      if (afterJson + 4 < len) {
        const maybeLen = view.getUint32(afterJson, true);
        if (maybeLen > 0 && maybeLen <= len - (afterJson + 4)) offset = afterJson + 4;
      }
      return { offset, reason: "OWON SPBXDS CH1 payload", detected: true };
    }
  }

  // 6. Leading printable ASCII preamble (including IEEE 488.2 "#<d><len>" blocks like Tektronix .isf / SCPI CURVE?).
  const isPrintableText = (b: number) => (b >= 0x20 && b <= 0x7e) || b === 0x09 || b === 0x0a || b === 0x0d;
  const scanLimit = Math.min(len, 65_536);
  let textRun = 0;
  while (textRun < scanLimit && isPrintableText(bytes[textRun] ?? 0)) textRun += 1;

  if (textRun >= 8) {
    const headText = asciiAt(0, textRun);
    const ieeeMatch = /#([1-9])(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = ieeeMatch.exec(headText)) !== null) {
      const digitCount = Number(m[1]);
      const digits = m[2] ?? "";
      if (digits.length < digitCount) continue;
      const blockBytes = Number(digits.slice(0, digitCount));
      const dataStart = m.index + 2 + digitCount;
      const remaining = len - dataStart;
      if (Number.isFinite(blockBytes) && blockBytes > 0 && dataStart < len && blockBytes <= remaining && remaining - blockBytes <= 64) {
        return { offset: dataStart, reason: "IEEE 488.2 binary block", detected: true };
      }
    }
    if (textRun < len) {
      let pos = textRun;
      const lastChar = bytes[textRun - 1] ?? 0;
      // Only skip trailing NUL padding when the ASCII header wasn't already terminated by a newline
      // (so a newline-terminated header followed by a 0.0 Float32 / 0 Int16 sample keeps sample 0 intact).
      if (lastChar !== 0x0a && lastChar !== 0x0d) {
        while (pos < scanLimit && bytes[pos] === 0) pos += 1;
      }
      const offset = pos < len ? pos : textRun;
      return { offset, reason: "End of ASCII header", detected: true };
    }
  }

  return { offset: 0, reason: "No known header found", detected: false };
}

/** Backwards-compatible numeric wrapper around detectBinaryDataStart. */
export function findBinaryDataStart(buffer: ArrayBuffer): number {
  return detectBinaryDataStart(buffer).offset;
}

/** Smart default configuration from binary signature and filename extension hints (e.g. .cf32, .sc16, .cu8). */
export function defaultBinaryConfig(
  fileName: string,
  byteLength: number,
  detectedScope: BinaryFormat | null,
): BinaryImportConfig {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  let sampleType: BinarySampleType = "float32";
  let layout: BinaryChannelLayout = "real";
  let yMult = 1;
  let yOffset = 0;

  if (ext === "cfile" || ext === "cf32" || ext === "fc32" || ext === "iq") {
    sampleType = "float32";
    layout = "iq";
  } else if (ext === "sc16" || ext === "cs16" || ext === "ci16") {
    sampleType = "int16";
    layout = "iq";
  } else if (ext === "cs8") {
    sampleType = "int8";
    layout = "iq";
  } else if (ext === "cu8") {
    sampleType = "uint8";
    layout = "iq";
    yMult = 1 / 127.5;
    yOffset = -1;
  } else if (ext === "f64") {
    sampleType = "float64";
  } else if (ext === "i32") {
    sampleType = "int32";
  } else if (ext === "u32") {
    sampleType = "uint32";
  } else if (ext === "i16" || ext === "s16") {
    sampleType = "int16";
  } else if (ext === "u8") {
    sampleType = "uint8";
  }

  const totalRaw = rawTotalSamples(byteLength, { sampleType, layout, channelCount: 2, headerBytes: 0 });
  const totalRawPoints = totalRaw * channelsPerFrame({ layout, channelCount: 2 });

  return {
    mode: detectedScope ? "auto-scope" : "raw",
    parserOverride: "auto",
    sampleType,
    endian: "le",
    layout,
    swapIQ: false,
    channelCount: 2,
    headerBytes: 0,
    sampleRateHz: 1_000_000,
    startSample: 0,
    sampleCount: 0,
    reduction: detectedScope ? { mode: "full" } : defaultBinaryReduction(totalRawPoints),
    yMult,
    yOffset,
    xMult: 1,
    xOffset: 0,
  };
}

/** Compact hex + ASCII inspector starting at `offset` (e.g. `headerBytes`) for inspecting binary layouts. */
export function formatHexPreview(buffer: ArrayBuffer, offset = 0, maxBytes = 64): string {
  const safeOffset = Math.max(0, Math.min(buffer.byteLength, Math.floor(Number.isFinite(offset) ? offset : 0)));
  const len = Math.min(buffer.byteLength - safeOffset, maxBytes);
  if (len <= 0) return "(end of file)";
  const bytes = new Uint8Array(buffer, safeOffset, len);
  const lines: string[] = [];
  for (let row = 0; row < bytes.length; row += 16) {
    const slice = bytes.subarray(row, Math.min(row + 16, bytes.length));
    const addr = (safeOffset + row).toString(16).padStart(4, "0");
    const hex = Array.from(slice, (b) => b.toString(16).padStart(2, "0")).join(" ").padEnd(47, " ");
    const ascii = Array.from(slice, (b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ".")).join("");
    lines.push(`${addr}  ${hex}  ${ascii}`);
  }
  return lines.join("\n");
}

function parseDetectedScope(
  buffer: ArrayBuffer,
  fileName: string,
  signature: BinaryFormat,
  options: BinaryParseOptions,
): BinaryParseResult {
  switch (signature) {
    case "wavebin": return parseWavebin(buffer, fileName, options);
    case "lecroy-trc": return parseLeCroyTrc(buffer, fileName, options);
    case "tek-isf": return parseTekIsf(buffer, fileName, options);
    case "owon-bin": return parseOwonBin(buffer, fileName, options);
    case "wav": return parseWavBin(buffer, fileName, options);
    case "npy": return parseNpyBin(buffer, fileName, options);
  }
}

function readTypedSample(view: DataView, offset: number, type: BinarySampleType, littleEndian: boolean): number {
  switch (type) {
    case "float32": return view.getFloat32(offset, littleEndian);
    case "float64": return view.getFloat64(offset, littleEndian);
    case "float16": return decodeFloat16(view.getUint16(offset, littleEndian));
    case "int32": return view.getInt32(offset, littleEndian);
    case "uint32": return view.getUint32(offset, littleEndian);
    case "int24": return readInt24(view, offset, littleEndian);
    case "uint24": return readUint24(view, offset, littleEndian);
    case "int16": return view.getInt16(offset, littleEndian);
    case "uint16": return view.getUint16(offset, littleEndian);
    case "int8": return view.getInt8(offset);
    case "uint8": return view.getUint8(offset);
  }
}

function parseRawBinary(
  buffer: ArrayBuffer,
  fileName: string,
  config: BinaryImportConfig,
  reductionOverride?: BinaryReduction,
): BinaryParseResult {
  const skip = Math.max(0, Math.floor(Number.isFinite(config.headerBytes) ? config.headerBytes : 0));
  const footer = Math.max(0, Math.floor(Number.isFinite(config.footerBytes ?? 0) ? (config.footerBytes ?? 0) : 0));
  const pad = Math.max(0, Math.floor(Number.isFinite(config.framePadBytes ?? 0) ? (config.framePadBytes ?? 0) : 0));
  if (skip + footer >= buffer.byteLength) {
    return { ok: false, error: `Header skip (${skip} B) + footer (${footer} B) exceeds file size (${buffer.byteLength} bytes).` };
  }
  const elemBytes = sampleTypeBytes(config.sampleType);
  const nChannels = channelsPerFrame(config);
  const frameBytes = elemBytes * nChannels + (config.layout === "planar" ? 0 : pad);
  const totalFrames = Math.floor((buffer.byteLength - skip - footer) / frameBytes);
  if (totalFrames < 2) {
    return { ok: false, error: "Not enough bytes after the header to form at least two samples." };
  }

  const start = Math.max(0, Math.min(totalFrames - 2, Math.floor(Number.isFinite(config.startSample) ? config.startSample : 0)));
  const requested = Math.floor(Number.isFinite(config.sampleCount) ? config.sampleCount : 0);
  const count = requested > 0 ? Math.min(requested, totalFrames - start) : totalFrames - start;
  if (count < 2) {
    return { ok: false, error: "Selected sample window has fewer than two samples." };
  }

  const view = new DataView(buffer);
  const le = config.endian === "le";
  const fs = Number.isFinite(config.sampleRateHz) && config.sampleRateHz > 0 ? config.sampleRateHz : 0;
  const xMult = Number.isFinite(config.xMult) && config.xMult !== 0 ? config.xMult : 1;
  const xOffset = Number.isFinite(config.xOffset ?? 0) ? (config.xOffset ?? 0) : 0;
  const yMult = Number.isFinite(config.yMult) && config.yMult !== 0 ? config.yMult : 1;
  const yOffset = Number.isFinite(config.yOffset) ? config.yOffset : 0;
  const dt = fs > 0 ? (1 / fs) * xMult : xMult;
  const xUnit = fs > 0 ? "s" : "unitless";
  const domain = fs > 0 ? ("time" as const) : ("frequency" as const);
  const family = fs > 0 ? ("waveform" as const) : ("spectrum" as const);
  const yUnit = config.yUnit === undefined ? null : config.yUnit === "" ? null : config.yUnit;

  const labels = config.layout === "real"
    ? ["CH1"]
    : config.layout === "iq"
      ? ["I", "Q"]
      : Array.from({ length: nChannels }, (_, i) => `CH${i + 1}`);

  const fileSerial = incrementFileCounter();
  const prefix = `${fileName.replace(/\.[^.]+$/, "")} `;
  const traces: RawTrace[] = [];
  const columnIdentities: ColumnIdentity[] = [];
  let decimatedNote: string | null = null;
  const planarChannelBytes = totalFrames * elemBytes;
  const effectiveReduction = reductionOverride ?? config.reduction;

  for (let ch = 0; ch < nChannels; ch++) {
    const label = labels[ch] ?? `CH${ch + 1}`;
    const sourceChannel = config.layout === "iq" && config.swapIQ ? (1 - ch) : ch;
    const readVal = (sampleIndex: number): number => {
      const byteOffset = config.layout === "planar"
        ? skip + sourceChannel * planarChannelBytes + (start + sampleIndex) * elemBytes
        : skip + (start + sampleIndex) * frameBytes + sourceChannel * elemBytes;
      const raw = readTypedSample(view, byteOffset, config.sampleType, le);
      return raw * yMult + yOffset;
    };

    const reduced = reduceBinarySeries({
      count,
      xStart: start * dt + xOffset,
      dt,
      readY: readVal,
      reduction: effectiveReduction,
    });
    if (reduced.decimationNote) {
      decimatedNote = `${reduced.decimationNote} (per ch)`;
    }

    const normalized = normalizeTraceData(reduced.points);
    if (normalized.length < 2) continue;
    traces.push({
      ...makeTrace(prefix, fileName, label, fileSerial),
      domain,
      family,
      isUniform: reduced.isUniform && dt > 0,
      ...(reduced.envelopeOf !== undefined ? { envelopeOf: reduced.envelopeOf } : {}),
      dn: `${fileName} ${label}`,
      units: { x: xUnit, y: yUnit },
      data: normalized,
    });
    columnIdentities.push({ index: ch, header: label });
  }

  if (traces.length === 0) {
    return { ok: false, error: "No finite samples were decoded with these binary settings. Try another data type or byte order." };
  }

  const layoutLabel = config.layout === "iq"
    ? (config.swapIQ ? "Complex IQ (Q, I swapped)" : "Complex IQ (I, Q)")
    : config.layout === "planar"
      ? `${nChannels} planar (sequential) channels`
      : config.layout === "interleaved"
        ? `${nChannels} interleaved channels`
        : "Single real channel";

  const meta: Record<string, MetadataEntry> = {
    Format: `Raw Binary (${config.sampleType.toUpperCase()} ${config.endian.toUpperCase()})`,
    Layout: layoutLabel,
    Channels: String(traces.length),
    Points: String(count),
    "Total Samples": String(totalFrames),
  };
  if (fs > 0) meta["Sample Rate"] = { value: fs, unit: "Hz" };
  if (skip > 0) meta["Header Skip"] = `${skip} bytes`;
  if (xOffset !== 0) meta["X Offset"] = `${xOffset}`;
  if (start > 0 || count < totalFrames) meta["Slice"] = `${start} .. ${start + count - 1}`;
  if (yMult !== 1 || yOffset !== 0) meta["Y Transform"] = `×${yMult}${yOffset !== 0 ? (yOffset > 0 ? ` + ${yOffset}` : ` − ${Math.abs(yOffset)}`) : ""}`;
  if (decimatedNote) meta["Decimation"] = decimatedNote;

  const datasets = traces.map((trace) => buildSeriesDatasetFromTrace(trace, family));
  const displayTraces: ScalarDisplayTrace[] = [];
  for (const [index, trace] of traces.entries()) {
    const dataset = datasets[index];
    const firstSeries = dataset?.series[0];
    if (!dataset || !firstSeries) continue;
    displayTraces.push(buildScalarDisplayTraceFromSeriesDataset(dataset, firstSeries, trace));
  }

  const summaryText = [
    `Format: ${String(meta["Format"])}`,
    `Layout: ${String(meta["Layout"])}`,
    `File Size: ${buffer.byteLength} bytes (${totalFrames} total frames)`,
    ...(fs > 0 ? [`Sample Rate: ${fs} Hz`] : ["X Axis: sample index"]),
    `Slice: start=${start}, count=${count}, headerSkip=${skip} B`,
  ].join("\n");

  const parsed: ParsedFile = {
    format: "raw-binary",
    meta: meta as FileMetadata,
    traces,
    datasets,
    displayTraces,
    columnIdentities,
    rawText: summaryText,
  };
  return { ok: true, parsed, summaryText };
}

function isChannelEnabled(index: number, config: BinaryImportConfig): boolean {
  const override = config.channelOverrides?.[index];
  if (override?.enabled !== undefined) return override.enabled;
  if (config.selectedChannels !== undefined) return config.selectedChannels.includes(index);
  return true;
}

function effectiveScopeSignature(buffer: ArrayBuffer, config: BinaryImportConfig): BinaryFormat | null {
  if (config.parserOverride && config.parserOverride !== "auto") return config.parserOverride;
  return detectBinarySignature(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, BINARY_SNIFF_BYTES)));
}

/** Parse any binary buffer using a BinaryImportConfig (auto-scope with pre-reduction slice + per-channel overrides OR raw binary/IQ). */
export function parseBinaryWithConfig(
  buffer: ArrayBuffer,
  fileName: string,
  config: BinaryImportConfig,
  options?: { readonly reduction?: BinaryReduction },
): BinaryParseResult {
  const effectiveReduction = options?.reduction ?? config.reduction;
  if (config.mode === "raw") {
    return parseRawBinary(buffer, fileName, config, effectiveReduction);
  }

  const signature = effectiveScopeSignature(buffer, config);
  if (!signature) {
    return parseRawBinary(buffer, fileName, { ...config, mode: "raw" }, effectiveReduction);
  }

  const start = Math.max(0, Math.floor(Number.isFinite(config.startSample) ? config.startSample : 0));
  const requested = Math.floor(Number.isFinite(config.sampleCount) ? config.sampleCount : 0);
  const slice: BinarySampleSlice | undefined = start > 0 || requested > 0 ? { start, count: requested } : undefined;

  // Apply sample slicing inside the scope parser BEFORE reduction so deep captures keep full resolution.
  const base = parseDetectedScope(buffer, fileName, signature, { slice, reduction: effectiveReduction });
  if (!base.ok) return base;

  const xMult = Number.isFinite(config.xMult) && config.xMult !== 0 ? config.xMult : 1;
  const xOffset = Number.isFinite(config.xOffset ?? 0) ? (config.xOffset ?? 0) : 0;
  const globalYMult = Number.isFinite(config.yMult) && config.yMult !== 0 ? config.yMult : 1;
  const globalYOffset = Number.isFinite(config.yOffset) ? config.yOffset : 0;
  const hasChannelOverrides = Boolean(config.channelOverrides && Object.keys(config.channelOverrides).length > 0);
  const hasOverrides = config.selectedChannels !== undefined
    || hasChannelOverrides
    || xMult !== 1
    || xOffset !== 0
    || globalYMult !== 1
    || globalYOffset !== 0
    || config.yUnit !== undefined;

  if (!hasOverrides && !slice) return base;

  const nextTraces: RawTrace[] = [];
  const nextIdentities: ColumnIdentity[] = [];

  for (let i = 0; i < base.parsed.traces.length; i++) {
    if (!isChannelEnabled(i, config)) continue;
    const orig = base.parsed.traces[i];
    if (!orig || orig.kind !== "raw") continue;

    const chOverride = config.channelOverrides?.[i];
    const chMult = chOverride?.yMult !== undefined && Number.isFinite(chOverride.yMult) && chOverride.yMult !== 0 ? chOverride.yMult : 1;
    const chOff = chOverride?.yOffset !== undefined && Number.isFinite(chOverride.yOffset) ? chOverride.yOffset : 0;
    const yMult = globalYMult * chMult;
    const yOffset = globalYOffset + chOff;

    let data = orig.data;
    if (xMult !== 1 || xOffset !== 0 || yMult !== 1 || yOffset !== 0) {
      const transformed: DataPoint[] = [];
      for (const pt of orig.data) {
        const freq = pt.freq * xMult + xOffset;
        const amp = pt.amp * yMult + yOffset;
        if (Number.isFinite(freq) && Number.isFinite(amp)) transformed.push({ freq, amp });
      }
      data = normalizeTraceData(transformed);
      if (data.length < 2) continue;
    }

    const chosenUnit = chOverride?.yUnit !== undefined ? chOverride.yUnit : config.yUnit;
    const yUnit = chosenUnit !== undefined ? (chosenUnit === "" ? null : chosenUnit) : orig.units.y;

    nextTraces.push({
      ...orig,
      units: { x: orig.units.x, y: yUnit },
      data,
    });
    const origIdentity = base.parsed.columnIdentities?.[i];
    nextIdentities.push(origIdentity ?? { index: i, header: orig.dn });
  }

  if (nextTraces.length === 0) {
    return { ok: false, error: "No traces remain with the selected channels and sample slice." };
  }

  const datasets = nextTraces.map((trace) => buildSeriesDatasetFromTrace(trace, trace.family === "spectrum" ? "spectrum" : "waveform"));
  const displayTraces: ScalarDisplayTrace[] = [];
  for (const [index, trace] of nextTraces.entries()) {
    const dataset = datasets[index];
    const firstSeries = dataset?.series[0];
    if (!dataset || !firstSeries) continue;
    displayTraces.push(buildScalarDisplayTraceFromSeriesDataset(dataset, firstSeries, trace));
  }

  const meta: Record<string, MetadataEntry> = { ...base.parsed.meta, Channels: String(nextTraces.length) };
  if (globalYMult !== 1 || globalYOffset !== 0) {
    meta["Y Transform"] = `×${globalYMult}${globalYOffset !== 0 ? (globalYOffset > 0 ? ` + ${globalYOffset}` : ` − ${Math.abs(globalYOffset)}`) : ""}`;
  }
  if (xMult !== 1) meta["X Scale"] = `×${xMult}`;
  if (xOffset !== 0) meta["X Offset"] = `${xOffset}`;
  if (slice) meta["Slice"] = `${start} .. ${requested > 0 ? start + requested - 1 : "end"}`;

  const parsed: ParsedFile = {
    ...base.parsed,
    meta: meta as FileMetadata,
    traces: nextTraces,
    datasets,
    displayTraces,
    columnIdentities: nextIdentities,
  };
  return { ok: true, parsed, summaryText: base.summaryText };
}

export interface BinaryPreviewChannel {
  readonly index: number;
  readonly label: string;
  readonly points: number;
  readonly yUnit: string | null;
}

export interface BinaryPreviewResult {
  readonly plot: OverviewPlot;
  readonly channels: readonly BinaryPreviewChannel[];
  readonly allScopeChannels: readonly BinaryPreviewChannel[];
  readonly headerSummary: string | null;
  readonly rangeText: string | null;
  readonly totalAvailableSamples: number;
  readonly sampleRateHz: number | null;
  readonly dtSeconds: number | null;
  readonly hexDump: string;
  readonly hexOffset: number;
  readonly encodingWarning: BinaryEncodingWarning | null;
  readonly error: string | null;
}

const PREVIEW_MAX_POINTS = 16_000;
const PREVIEW_REDUCTION: BinaryReduction = { mode: "envelope", targetPoints: PREVIEW_MAX_POINTS };

function formatScopeHeaderSummary(meta: FileMetadata): string {
  const parts: string[] = [];
  const fmt = meta["Format"];
  if (typeof fmt === "string" && fmt) parts.push(fmt);
  const inst = meta["Instrument"];
  if (typeof inst === "string" && inst) parts.push(inst);
  const pts = meta["Points"];
  if (typeof pts === "string" && pts) {
    const n = Number(pts);
    parts.push(Number.isFinite(n) ? `${n.toLocaleString("en-US")} pts` : `${pts} pts`);
  }
  const sr = meta["Sample Rate"];
  if (sr && typeof sr === "object" && "value" in sr && Number.isFinite(sr.value)) {
    parts.push(formatScalarWithUnit(sr.value, "Sa/s", { digits: 3 }));
  }
  const enc = meta["Encoding"];
  if (typeof enc === "string" && enc) parts.push(enc);
  return parts.join(" · ");
}

function computeRawRateAndDt(config: BinaryImportConfig): { readonly sampleRateHz: number | null; readonly dtSeconds: number | null } {
  const fs = Number.isFinite(config.sampleRateHz) && config.sampleRateHz > 0 ? config.sampleRateHz : 0;
  if (fs <= 0) return { sampleRateHz: null, dtSeconds: null };
  const absXMult = Number.isFinite(config.xMult) && config.xMult !== 0 ? Math.abs(config.xMult) : 1;
  const dtSeconds = (1 / fs) * absXMult;
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return { sampleRateHz: null, dtSeconds: null };
  const sampleRateHz = 1 / dtSeconds;
  return Number.isFinite(sampleRateHz) && sampleRateHz > 0
    ? { sampleRateHz, dtSeconds }
    : { sampleRateHz: null, dtSeconds: null };
}

/** Fast preview computation for the Binary Import Wizard dialog. */
export function previewBinaryImport(
  buffer: ArrayBuffer,
  fileName: string,
  config: BinaryImportConfig,
  hexView?: { readonly offset?: number; readonly maxBytes?: number },
): BinaryPreviewResult {
  const defaultOffset = config.mode === "raw"
    ? Math.max(0, Math.min(buffer.byteLength, Math.floor(Number.isFinite(config.headerBytes) ? config.headerBytes : 0)))
    : 0;
  const hexOffset = hexView?.offset !== undefined
    ? Math.max(0, Math.min(buffer.byteLength, Math.floor(Number.isFinite(hexView.offset) ? hexView.offset : defaultOffset)))
    : defaultOffset;
  const hexLength = Math.max(16, Math.min(4096, Math.floor(hexView?.maxBytes ?? 64)));
  const hexDump = formatHexPreview(buffer, hexOffset, hexLength);
  const signature = effectiveScopeSignature(buffer, config);

  let allScopeChannels: BinaryPreviewChannel[] = [];
  let headerSummary: string | null = null;
  let totalAvailableSamples = rawTotalSamples(buffer.byteLength, config);
  let scopeSampleRateHz: number | null = null;
  let scopeDomain: "time" | "frequency" | null = null;

  if (signature) {
    const fullScope = parseDetectedScope(buffer, fileName, signature, { reduction: PREVIEW_REDUCTION });
    if (fullScope.ok) {
      allScopeChannels = fullScope.parsed.traces.map((trace, index) => ({
        index,
        label: fullScope.parsed.columnIdentities?.[index]?.header ?? trace.dn,
        points: trace.envelopeOf ?? trace.data.length,
        yUnit: trace.units.y,
      }));
      headerSummary = formatScopeHeaderSummary(fullScope.parsed.meta);
      scopeDomain = fullScope.parsed.traces[0]?.domain ?? null;
      const sr = fullScope.parsed.meta["Sample Rate"];
      if (sr && typeof sr === "object" && "value" in sr && Number.isFinite(sr.value) && sr.value > 0) {
        scopeSampleRateHz = sr.value;
      }
      if (config.mode === "auto-scope") {
        const declaredPts = Number(fullScope.parsed.meta["Points"]);
        if (Number.isFinite(declaredPts) && declaredPts > 0) totalAvailableSamples = declaredPts;
      }
    }
  }

  const parsedResult = parseBinaryWithConfig(buffer, fileName, config, { reduction: PREVIEW_REDUCTION });

  // Probe raw decoded samples in Custom mode (before NaN filtering) to warn about wrong endianness/type/alignment.
  let encodingWarning: BinaryEncodingWarning | null = null;
  if (config.mode === "raw" || !signature) {
    const skip = Math.max(0, Math.floor(Number.isFinite(config.headerBytes) ? config.headerBytes : 0));
    const footer = Math.max(0, Math.floor(Number.isFinite(config.footerBytes ?? 0) ? (config.footerBytes ?? 0) : 0));
    const pad = Math.max(0, Math.floor(Number.isFinite(config.framePadBytes ?? 0) ? (config.framePadBytes ?? 0) : 0));
    const elemBytes = sampleTypeBytes(config.sampleType);
    const nChannels = channelsPerFrame(config);
    const frameBytes = elemBytes * nChannels + (config.layout === "planar" ? 0 : pad);
    const totalFrames = skip + footer < buffer.byteLength && frameBytes > 0
      ? Math.floor((buffer.byteLength - skip - footer) / frameBytes)
      : 0;
    const start = Math.max(0, Math.min(Math.max(0, totalFrames - 1), Math.floor(Number.isFinite(config.startSample) ? config.startSample : 0)));
    const probeCount = Math.min(512, Math.max(0, totalFrames - start));
    if (probeCount >= 2) {
      const view = new DataView(buffer);
      const le = config.endian === "le";
      const probeSamples: number[] = [];
      for (let i = 0; i < probeCount; i++) {
        const byteOffset = config.layout === "planar"
          ? skip + (start + i) * elemBytes
          : skip + (start + i) * frameBytes;
        if (byteOffset + elemBytes > buffer.byteLength) break;
        probeSamples.push(readTypedSample(view, byteOffset, config.sampleType, le));
      }
      encodingWarning = analyzeDecodedQuality(probeSamples, config.sampleType);
    }
  }

  let sampleRateHz: number | null = null;
  let dtSeconds: number | null = null;
  if (config.mode === "raw" || !signature) {
    ({ sampleRateHz, dtSeconds } = computeRawRateAndDt(config));
  } else {
    const activeDomain = (parsedResult.ok ? parsedResult.parsed.traces[0]?.domain : scopeDomain) ?? "time";
    if (activeDomain === "time" && scopeSampleRateHz !== null) {
      const absXMult = Number.isFinite(config.xMult) && config.xMult !== 0 ? Math.abs(config.xMult) : 1;
      const dt = (1 / scopeSampleRateHz) * absXMult;
      if (Number.isFinite(dt) && dt > 0 && Number.isFinite(1 / dt) && 1 / dt > 0) {
        dtSeconds = dt;
        sampleRateHz = 1 / dt;
      }
    }
  }

  if (!parsedResult.ok) {
    return {
      plot: { series: [], band: null, xRange: null, yRange: null },
      channels: [],
      allScopeChannels,
      headerSummary,
      rangeText: null,
      totalAvailableSamples,
      sampleRateHz,
      dtSeconds,
      hexDump,
      hexOffset,
      encodingWarning,
      error: parsedResult.error,
    };
  }

  const traces = parsedResult.parsed.traces;
  let x0 = Infinity; let x1 = -Infinity;
  for (const trace of traces) {
    const first = trace.data[0]; const last = trace.data[trace.data.length - 1];
    if (first && first.freq < x0) x0 = first.freq;
    if (last && last.freq > x1) x1 = last.freq;
  }
  if (!Number.isFinite(x0) || !Number.isFinite(x1)) {
    return {
      plot: { series: [], band: null, xRange: null, yRange: null },
      channels: [],
      allScopeChannels,
      headerSummary,
      rangeText: null,
      totalAvailableSamples,
      sampleRateHz,
      dtSeconds,
      hexDump,
      hexOffset,
      encodingWarning,
      error: "No finite points to plot.",
    };
  }

  const reduced = traces.map((trace) => decimateMinMax(trace.data, x0, x1, PLOT_BUCKETS));
  let y0 = Infinity; let y1 = -Infinity;
  for (const line of reduced) {
    for (const pt of line) {
      if (pt.amp < y0) y0 = pt.amp;
      if (pt.amp > y1) y1 = pt.amp;
    }
  }
  const sx = (x: number) => (x1 > x0 ? (x - x0) / (x1 - x0) : 0.5);
  const sy = (y: number) => (y1 > y0 ? 1 - (y - y0) / (y1 - y0) : 0.5);

  const firstTrace = traces[0];
  const xSpan = x1 > x0 ? x1 - x0 : Math.max(Math.abs(x1), 1e-12);
  const xOpts = { domain: firstTrace?.domain ?? ("time" as const), unit: firstTrace?.units.x ?? "s" };
  const xText = `X: ${formatAdaptiveXAxisValue(x0, xSpan, xOpts)} → ${formatAdaptiveXAxisValue(x1, xSpan, xOpts)}`;
  const yUnit = firstTrace?.units.y ?? null;
  const yText = Number.isFinite(y0) && Number.isFinite(y1)
    ? ` · Y: ${formatScalarWithUnit(y0, yUnit, { digits: 3 })} → ${formatScalarWithUnit(y1, yUnit, { digits: 3 })}`
    : "";

  return {
    plot: {
      series: reduced.map((line) => [line.map((pt) => ({ x: sx(pt.freq), y: sy(pt.amp) }))]),
      band: null,
      xRange: { min: x0, max: x1 },
      yRange: Number.isFinite(y0) && Number.isFinite(y1) ? { min: y0, max: y1 } : null,
    },
    channels: traces.map((trace, index) => ({
      index,
      label: parsedResult.parsed.columnIdentities?.[index]?.header ?? trace.dn,
      points: trace.envelopeOf ?? trace.data.length,
      yUnit: trace.units.y,
    })),
    allScopeChannels,
    headerSummary,
    rangeText: `${xText}${yText}`,
    totalAvailableSamples,
    sampleRateHz,
    dtSeconds,
    hexDump,
    hexOffset,
    encodingWarning,
    error: null,
  };
}
