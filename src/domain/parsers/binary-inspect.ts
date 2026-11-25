// ============================================================================
// Mergen Scope — Binary Cursor Inspection & Decoding Quality Helpers
// ============================================================================
// Pure domain helpers (no React, no DOM) for inspecting raw binary buffers at
// arbitrary byte offsets and flagging likely misaligned/byte-swapped decodes.
// ============================================================================

export type InspectEndian = "le" | "be";

export interface BinaryCursorReadings {
  readonly offset: number;
  readonly byteHex: string | null;
  readonly ascii: string | null;
  readonly u8: number | null;
  readonly i8: number | null;
  readonly u16: number | null;
  readonly i16: number | null;
  readonly u24: number | null;
  readonly i24: number | null;
  readonly u32: number | null;
  readonly i32: number | null;
  readonly f16: number | null;
  readonly f32: number | null;
  readonly f64: number | null;
}

export interface BinaryEncodingWarning {
  readonly severity: "warning";
  readonly message: string;
}

const QUALITY_PREVIEW_LIMIT = 2048;
const FLOAT_TYPES = new Set<string>(["float16", "float32", "float64"]);

/**
 * Decodes an IEEE 754 binary16 (half-precision) 16-bit pattern into a JS number.
 * Handles +0, -0, subnormals, normal values, +Infinity, -Infinity, and NaN.
 */
export function decodeFloat16(bits: number): number {
  const u16 = bits & 0xffff;
  const sign = (u16 & 0x8000) !== 0 ? -1 : 1;
  const exp = (u16 >>> 10) & 0x1f;
  const frac = u16 & 0x03ff;

  if (exp === 0) {
    if (frac === 0) {
      return sign === -1 ? -0 : 0;
    }
    return sign * Math.pow(2, -14) * (frac / 1024);
  }

  if (exp === 0x1f) {
    return frac === 0 ? sign * Infinity : Number.NaN;
  }

  return sign * Math.pow(2, exp - 15) * (1 + frac / 1024);
}

/**
 * Reads an unsigned 24-bit integer (`0 .. 16777215`) from 3 bytes in `view`.
 */
export function readUint24(view: DataView, byteOffset: number, littleEndian: boolean): number {
  if (!Number.isInteger(byteOffset) || byteOffset < 0 || byteOffset + 3 > view.byteLength) {
    throw new RangeError(`readUint24 offset ${byteOffset} out of bounds for byteLength ${view.byteLength}`);
  }
  const b0 = view.getUint8(byteOffset);
  const b1 = view.getUint8(byteOffset + 1);
  const b2 = view.getUint8(byteOffset + 2);
  return littleEndian
    ? ((b2 << 16) | (b1 << 8) | b0) >>> 0
    : ((b0 << 16) | (b1 << 8) | b2) >>> 0;
}

/**
 * Reads a signed two's-complement 24-bit integer (`-8388608 .. 8388607`) from 3 bytes in `view`.
 */
export function readInt24(view: DataView, byteOffset: number, littleEndian: boolean): number {
  const raw = readUint24(view, byteOffset, littleEndian);
  return (raw & 0x800000) !== 0 ? raw - 0x1000000 : raw;
}

/**
 * Safely decodes all supported scalar interpretations starting at `offset` in `buffer`.
 * Returns `null` for any type whose byte width exceeds the remaining bytes (or when `offset` is out of range).
 */
export function inspectBinaryCursor(
  buffer: ArrayBuffer,
  offset: number,
  endian: InspectEndian,
): BinaryCursorReadings {
  const byteLength = buffer.byteLength;
  const safeOffset = Number.isFinite(offset) ? Math.trunc(offset) : -1;
  const canRead = (size: number): boolean => safeOffset >= 0 && safeOffset + size <= byteLength;

  if (!canRead(1)) {
    return {
      offset: safeOffset >= 0 ? safeOffset : 0,
      byteHex: null,
      ascii: null,
      u8: null,
      i8: null,
      u16: null,
      i16: null,
      u24: null,
      i24: null,
      u32: null,
      i32: null,
      f16: null,
      f32: null,
      f64: null,
    };
  }

  const view = new DataView(buffer);
  const littleEndian = endian === "le";
  const u8 = view.getUint8(safeOffset);

  return {
    offset: safeOffset,
    byteHex: u8.toString(16).padStart(2, "0"),
    ascii: u8 >= 0x20 && u8 <= 0x7e ? String.fromCharCode(u8) : ".",
    u8,
    i8: view.getInt8(safeOffset),
    u16: canRead(2) ? view.getUint16(safeOffset, littleEndian) : null,
    i16: canRead(2) ? view.getInt16(safeOffset, littleEndian) : null,
    u24: canRead(3) ? readUint24(view, safeOffset, littleEndian) : null,
    i24: canRead(3) ? readInt24(view, safeOffset, littleEndian) : null,
    u32: canRead(4) ? view.getUint32(safeOffset, littleEndian) : null,
    i32: canRead(4) ? view.getInt32(safeOffset, littleEndian) : null,
    f16: canRead(2) ? decodeFloat16(view.getUint16(safeOffset, littleEndian)) : null,
    f32: canRead(4) ? view.getFloat32(safeOffset, littleEndian) : null,
    f64: canRead(8) ? view.getFloat64(safeOffset, littleEndian) : null,
  };
}

/**
 * Inspects a preview slice of decoded sample values and warns if they look
 * non-finite or misaligned/byte-swapped (for floating-point sample types).
 */
export function analyzeDecodedQuality(
  samples: readonly number[],
  sampleType: string,
): BinaryEncodingWarning | null {
  if (samples.length === 0) return null;

  const limit = Math.min(samples.length, QUALITY_PREVIEW_LIMIT);
  const isFloatType = FLOAT_TYPES.has(sampleType);
  let nonFiniteCount = 0;
  let extremeCount = 0;
  let tinyCount = 0;

  for (let i = 0; i < limit; i += 1) {
    const v = samples[i];
    if (v === undefined) continue;
    if (!Number.isFinite(v)) {
      nonFiniteCount += 1;
      continue;
    }
    if (isFloatType) {
      const abs = Math.abs(v);
      if (abs > 1e15) {
        extremeCount += 1;
      } else if (v !== 0 && abs < 1e-25) {
        tinyCount += 1;
      }
    }
  }

  if (nonFiniteCount > 0) {
    return {
      severity: "warning",
      message: "Decoded values include NaN or Infinity — try toggling Byte order, changing Type, or adjusting Skip bytes.",
    };
  }

  if (isFloatType) {
    const threshold = Math.max(2, Math.ceil(limit * 0.15));
    if (extremeCount + tinyCount >= threshold) {
      return {
        severity: "warning",
        message: "Floating-point values look misaligned (extreme exponents) — try toggling Byte order or nudging Skip bytes.",
      };
    }
  }

  return null;
}
