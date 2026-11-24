// ============================================================================
// Mergen Scope — Binary Measurement File Signature Sniffer
// ============================================================================
// Content-first detection for binary oscilloscope/instrument formats (never
// relies on the filename extension).
// ============================================================================

import type { ConfidenceLevel } from "./tabular-detect.ts";

export type BinaryFormat = "wavebin" | "lecroy-trc" | "tek-isf" | "owon-bin" | "wav" | "npy";

/** Minimum header prefix bytes needed to sniff any supported binary signature. */
export const BINARY_SNIFF_BYTES = 64;

/** Prefix bytes scanned to distinguish binary payloads (including files with ASCII preambles) from plain text. */
export const BINARY_TEXT_SNIFF_BYTES = 8192;

const STRICT_RAW_SDR_EXT = /\.(?:cfile|cf32|fc32|sc16|cs16|ci16|cu8|cs8|iq|f32|f64|i32|u32|i16|s16|u16|u8|pcm)$/i;

export function isStrictRawBinaryExtension(fileName: string): boolean {
  return STRICT_RAW_SDR_EXT.test(fileName);
}

export function scopeFormatLabel(format: BinaryFormat | null): string {
  switch (format) {
    case "wavebin": return "Keysight / Rigol (.bin)";
    case "lecroy-trc": return "LeCroy (.trc)";
    case "tek-isf": return "Tektronix (.isf)";
    case "owon-bin": return "OWON (.bin)";
    case "wav": return "RIFF / WAV (.wav)";
    case "npy": return "NumPy (.npy)";
    default: return "Raw binary";
  }
}

export interface BinaryDetectionConfidence {
  readonly score: number;
  readonly level: ConfidenceLevel;
  readonly reasons: readonly string[];
  readonly label: string;
}

export interface BinaryConfidenceInput {
  readonly mode: "auto-scope" | "raw";
  readonly detectedScope: BinaryFormat | null;
  readonly parserOverride?: "auto" | BinaryFormat;
  readonly fileName: string;
  readonly warning?: string;
}

function confidenceLevel(score: number): ConfidenceLevel {
  return score >= 0.8 ? "high" : score >= 0.55 ? "medium" : "low";
}

/** Score detection confidence and provide actionable reasons for the Binary Import Wizard. */
export function classifyBinaryConfidence(input: BinaryConfidenceInput): BinaryDetectionConfidence {
  const trimmedWarning = input.warning?.trim();
  if (trimmedWarning) {
    const effective = input.mode === "auto-scope"
      ? (input.parserOverride && input.parserOverride !== "auto" ? input.parserOverride : input.detectedScope)
      : null;
    const score = 0.3;
    return {
      score,
      level: confidenceLevel(score),
      reasons: [trimmedWarning, "Verify parser format or adjust raw binary settings"],
      label: scopeFormatLabel(effective),
    };
  }

  if (input.mode === "auto-scope") {
    const hasOverride = input.parserOverride !== undefined && input.parserOverride !== "auto";
    const effective = hasOverride ? input.parserOverride : input.detectedScope;

    if (hasOverride && input.parserOverride !== input.detectedScope) {
      const score = 0.68;
      const reason = input.detectedScope
        ? "Selected parser overrides detected header signature"
        : "No matching scope header signature found; using forced parser";
      return {
        score,
        level: confidenceLevel(score),
        reasons: [reason],
        label: scopeFormatLabel(effective ?? null),
      };
    }

    if (effective !== null && effective !== undefined) {
      const score = 1;
      return {
        score,
        level: confidenceLevel(score),
        reasons: [],
        label: scopeFormatLabel(effective),
      };
    }

    const score = 0.25;
    return {
      score,
      level: confidenceLevel(score),
      reasons: ["No oscilloscope header signature detected"],
      label: scopeFormatLabel(null),
    };
  }

  if (isStrictRawBinaryExtension(input.fileName)) {
    const score = 0.65;
    return {
      score,
      level: confidenceLevel(score),
      reasons: [
        "Sample type and channel layout inferred from file extension",
        "Sample rate (assumed 1 MHz) and byte order have no header",
      ],
      label: scopeFormatLabel(null),
    };
  }

  const score = 0.25;
  return {
    score,
    level: confidenceLevel(score),
    reasons: ["Headerless raw binary \u2014 sample type, layout, header skip, and sample rate are guessed"],
    label: scopeFormatLabel(null),
  };
}

function isAsciiDigit(byte: number | undefined): boolean {
  return byte !== undefined && byte >= 0x30 && byte <= 0x39;
}

function matchesAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  if (offset < 0 || offset + text.length > bytes.byteLength) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Keysight/Agilent ("AG") and Rigol ("RG") oscilloscope binary (.bin) header:
 * bytes 0..1 = "AG" or "RG", bytes 2..3 = 2-char ASCII version ("10", "01", "03")
 * or small binary version, followed by binary int32/int64 fileSize & nWaveforms
 * (which contain control/NUL bytes, distinguishing them from plain CSV text like "AG,1,2").
 */
function looksLikeWavebin(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  const b0 = bytes[0];
  const b1 = bytes[1];
  const isAG = b0 === 0x41 && b1 === 0x47; // "AG"
  const isRG = b0 === 0x52 && b1 === 0x47; // "RG"
  if (!isAG && !isRG) return false;

  const b2 = bytes[2] ?? 0;
  const b3 = bytes[3] ?? 0;
  const asciiVersion = isAsciiDigit(b2) && isAsciiDigit(b3);
  const binaryVersion = b2 <= 0x10 && b3 <= 0x10;
  if (!asciiVersion && !binaryVersion) return false;

  const limit = Math.min(bytes.byteLength, 16);
  for (let i = 4; i < limit; i++) {
    const byte = bytes[i] ?? 0;
    if (byte === 0 || (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d)) {
      return true;
    }
  }
  return false;
}

/**
 * Teledyne LeCroy .trc: starts with "WAVEDESC" at offset 0 or right after an
 * IEEE-488.2 SCPI definite-length block header (e.g. "#9000012345WAVEDESC" or "DESC,#9...WAVEDESC").
 */
function looksLikeLeCroyTrc(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 16) return false;
  const limit = Math.min(bytes.byteLength - 8, 32);
  for (let offset = 0; offset <= limit; offset++) {
    if (matchesAscii(bytes, offset, "WAVEDESC")) return true;
  }
  return false;
}

/**
 * Tektronix .isf (Internal Save Format): starts with ASCII SCPI preamble
 * ":WFMPRE:" / ":WFMP:" / ":WFMOUTPRE:" / ":WFMO:" (with or without leading colon).
 */
function looksLikeTekIsf(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 16) return false;
  let prefix = "";
  const limit = Math.min(bytes.byteLength, 32);
  for (let i = 0; i < limit; i++) {
    const code = bytes[i] ?? 0;
    if (code === 0) break;
    prefix += String.fromCharCode(code);
  }
  return /^\s*:?(?:WFMP(?:RE)?|WFMO(?:UTPRE)?):/i.test(prefix);
}

/** OWON XDS/SDS .bin: starts with 6-byte magic "SPBXDS" followed by uint32 JSON length. */
function looksLikeOwonBin(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 12 && matchesAscii(bytes, 0, "SPBXDS");
}

/** RIFF/WAVE audio/DAQ/SDR IQ file: "RIFF" at 0..3 and "WAVE" at 8..11. */
function looksLikeWav(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 12 && matchesAscii(bytes, 0, "RIFF") && matchesAscii(bytes, 8, "WAVE");
}

/** NumPy .npy binary array: 0x93 followed by "NUMPY" and major version 1..3. */
function looksLikeNpy(bytes: Uint8Array): boolean {
  const major = bytes[6] ?? 0;
  return bytes.byteLength >= 10 && bytes[0] === 0x93 && matchesAscii(bytes, 1, "NUMPY") && major >= 1 && major <= 3;
}

/** Detect a supported binary measurement format from its leading bytes, or null. */
export function detectBinarySignature(bytes: Uint8Array): BinaryFormat | null {
  if (looksLikeWavebin(bytes)) return "wavebin";
  if (looksLikeLeCroyTrc(bytes)) return "lecroy-trc";
  if (looksLikeTekIsf(bytes)) return "tek-isf";
  if (looksLikeOwonBin(bytes)) return "owon-bin";
  if (looksLikeWav(bytes)) return "wav";
  if (looksLikeNpy(bytes)) return "npy";
  return null;
}
