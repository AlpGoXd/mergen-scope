// ============================================================================
// Mergen Scope — NumPy .npy Binary Array Parser
// ============================================================================
// Parses NumPy .npy v1.0 / v2.0 / v3.0 binary array files:
//   [6B 0x93NUMPY] [1B major] [1B minor] [2B/4B LE headerLen] [header dict] [data...]
// Pure domain module with strict untrusted-input bounds & header checks.
// ============================================================================

import type { RawTrace } from "../../types/trace.ts";
import type { ColumnIdentity, FileMetadata, MetadataEntry, ParsedFile } from "../../types/file.ts";
import type { ScalarDisplayTrace } from "../../types/display.ts";
import { makeTrace } from "../trace-model.ts";
import { buildScalarDisplayTraceFromSeriesDataset, buildSeriesDatasetFromTrace } from "../dataset-builders.ts";
import { incrementFileCounter } from "./rs-dat.ts";
import { normalizeTraceData } from "./helpers.ts";
import { reduceBinarySeries } from "./binary-reduce.ts";
import type { BinaryParseOptions, ScopeProbeResult } from "./binary-reduce.ts";
import { decodeFloat16 } from "./binary-inspect.ts";
import type { BinaryParseResult } from "./lecroy-trc.ts";

const MAX_NPY_HEADER_BYTES = 1024 * 1024;
const MAX_CHANNELS = 16;
const MAX_PY_LITERAL_DEPTH = 16;

const NPY_MAGIC = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59] as const;

const HOST_LITTLE_ENDIAN = new DataView(new Uint16Array([1]).buffer).getUint8(0) === 1;

// ---------------------------------------------------------------------------
// Strict Python literal parser for .npy header dicts (no eval / Function)
// ---------------------------------------------------------------------------

type PyValue =
  | string
  | number
  | boolean
  | null
  | { readonly kind: "tuple"; readonly items: readonly PyValue[] }
  | { readonly kind: "list"; readonly items: readonly PyValue[] }
  | { readonly kind: "dict"; readonly entries: ReadonlyMap<string, PyValue> };

class PyLiteralParser {
  private pos = 0;

  constructor(private readonly text: string) {}

  parseRootDict(): { readonly ok: true; readonly entries: ReadonlyMap<string, PyValue> } | { readonly ok: false; readonly error: string } {
    this.skipWhitespace();
    const value = this.parseValue(0);
    if (!value.ok) return value;
    this.skipWhitespace();
    if (this.pos < this.text.length) {
      return { ok: false, error: "Malformed .npy header: unexpected trailing characters." };
    }
    if (typeof value.value !== "object" || value.value === null || value.value.kind !== "dict") {
      return { ok: false, error: "Malformed .npy header: expected a Python dict." };
    }
    return { ok: true, entries: value.value.entries };
  }

  private skipWhitespace(): void {
    while (this.pos < this.text.length) {
      const ch = this.text.charCodeAt(this.pos);
      if (ch === 0x20 || ch === 0x09 || ch === 0x0a || ch === 0x0d) {
        this.pos += 1;
      } else {
        break;
      }
    }
  }

  private parseValue(depth: number): { readonly ok: true; readonly value: PyValue } | { readonly ok: false; readonly error: string } {
    if (depth > MAX_PY_LITERAL_DEPTH) {
      return { ok: false, error: "Malformed .npy header: nesting depth exceeded." };
    }
    this.skipWhitespace();
    if (this.pos >= this.text.length) {
      return { ok: false, error: "Malformed .npy header: unexpected end of header." };
    }

    const ch = this.text[this.pos];
    if (ch === "{") return this.parseDict(depth + 1);
    if (ch === "(") return this.parseTupleOrParen(depth + 1);
    if (ch === "[") return this.parseList(depth + 1);
    if (ch === "'" || ch === "\"") return this.parseString();
    if (ch === "-" || ch === "+" || (ch !== undefined && ch >= "0" && ch <= "9")) return this.parseInteger();
    return this.parseKeyword();
  }

  private parseDict(depth: number): { readonly ok: true; readonly value: PyValue } | { readonly ok: false; readonly error: string } {
    this.pos += 1; // consume '{'
    const entries = new Map<string, PyValue>();
    this.skipWhitespace();
    if (this.text[this.pos] === "}") {
      this.pos += 1;
      return { ok: true, value: { kind: "dict", entries } };
    }

    while (this.pos < this.text.length) {
      this.skipWhitespace();
      const keyRes = this.parseString();
      if (!keyRes.ok) return { ok: false, error: "Malformed .npy header: dict key must be a string." };
      this.skipWhitespace();
      if (this.text[this.pos] !== ":") {
        return { ok: false, error: "Malformed .npy header: expected ':' after dict key." };
      }
      this.pos += 1;
      const valRes = this.parseValue(depth);
      if (!valRes.ok) return valRes;
      entries.set(keyRes.value, valRes.value);

      this.skipWhitespace();
      const next = this.text[this.pos];
      if (next === ",") {
        this.pos += 1;
        this.skipWhitespace();
        if (this.text[this.pos] === "}") {
          this.pos += 1;
          return { ok: true, value: { kind: "dict", entries } };
        }
        continue;
      }
      if (next === "}") {
        this.pos += 1;
        return { ok: true, value: { kind: "dict", entries } };
      }
      return { ok: false, error: "Malformed .npy header: expected ',' or '}' in dict." };
    }
    return { ok: false, error: "Malformed .npy header: unterminated dict." };
  }

  private parseTupleOrParen(depth: number): { readonly ok: true; readonly value: PyValue } | { readonly ok: false; readonly error: string } {
    this.pos += 1; // consume '('
    this.skipWhitespace();
    if (this.text[this.pos] === ")") {
      this.pos += 1;
      return { ok: true, value: { kind: "tuple", items: [] } };
    }

    const items: PyValue[] = [];
    let sawComma = false;
    while (this.pos < this.text.length) {
      const itemRes = this.parseValue(depth);
      if (!itemRes.ok) return itemRes;
      items.push(itemRes.value);
      this.skipWhitespace();
      const next = this.text[this.pos];
      if (next === ",") {
        sawComma = true;
        this.pos += 1;
        this.skipWhitespace();
        if (this.text[this.pos] === ")") {
          this.pos += 1;
          return { ok: true, value: { kind: "tuple", items } };
        }
        continue;
      }
      if (next === ")") {
        this.pos += 1;
        if (items.length === 1 && !sawComma) {
          const single = items[0];
          if (single !== undefined) return { ok: true, value: single };
        }
        return { ok: true, value: { kind: "tuple", items } };
      }
      return { ok: false, error: "Malformed .npy header: expected ',' or ')' in tuple." };
    }
    return { ok: false, error: "Malformed .npy header: unterminated tuple." };
  }

  private parseList(depth: number): { readonly ok: true; readonly value: PyValue } | { readonly ok: false; readonly error: string } {
    this.pos += 1; // consume '['
    this.skipWhitespace();
    if (this.text[this.pos] === "]") {
      this.pos += 1;
      return { ok: true, value: { kind: "list", items: [] } };
    }

    const items: PyValue[] = [];
    while (this.pos < this.text.length) {
      const itemRes = this.parseValue(depth);
      if (!itemRes.ok) return itemRes;
      items.push(itemRes.value);
      this.skipWhitespace();
      const next = this.text[this.pos];
      if (next === ",") {
        this.pos += 1;
        this.skipWhitespace();
        if (this.text[this.pos] === "]") {
          this.pos += 1;
          return { ok: true, value: { kind: "list", items } };
        }
        continue;
      }
      if (next === "]") {
        this.pos += 1;
        return { ok: true, value: { kind: "list", items } };
      }
      return { ok: false, error: "Malformed .npy header: expected ',' or ']' in list." };
    }
    return { ok: false, error: "Malformed .npy header: unterminated list." };
  }

  private parseString(): { readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: string } {
    const quote = this.text[this.pos];
    if (quote !== "'" && quote !== "\"") {
      return { ok: false, error: "Malformed .npy header: expected string literal." };
    }
    this.pos += 1;
    let out = "";
    while (this.pos < this.text.length) {
      const ch = this.text[this.pos];
      if (ch === quote) {
        this.pos += 1;
        return { ok: true, value: out };
      }
      if (ch === "\\") {
        this.pos += 1;
        if (this.pos >= this.text.length) {
          return { ok: false, error: "Malformed .npy header: unterminated escape in string." };
        }
        const esc = this.text[this.pos];
        this.pos += 1;
        if (esc === "n") out += "\n";
        else if (esc === "r") out += "\r";
        else if (esc === "t") out += "\t";
        else if (esc === "\\" || esc === "'" || esc === "\"") out += esc;
        else if (esc === "x") {
          const hex = this.text.slice(this.pos, this.pos + 2);
          if (!/^[0-9a-fA-F]{2}$/.test(hex)) {
            return { ok: false, error: "Malformed .npy header: invalid hex escape in string." };
          }
          out += String.fromCharCode(Number.parseInt(hex, 16));
          this.pos += 2;
        } else if (esc !== undefined) {
          out += esc;
        }
        continue;
      }
      if (ch !== undefined) out += ch;
      this.pos += 1;
    }
    return { ok: false, error: "Malformed .npy header: unterminated string." };
  }

  private parseInteger(): { readonly ok: true; readonly value: number } | { readonly ok: false; readonly error: string } {
    const slice = this.text.slice(this.pos);
    const match = slice.match(/^[+-]?\d+/);
    if (!match) {
      return { ok: false, error: "Malformed .npy header: invalid integer literal." };
    }
    const token = match[0];
    const after = this.text[this.pos + token.length];
    if (after === "." || after === "e" || after === "E") {
      return { ok: false, error: "Malformed .npy header: expected integer, got float." };
    }
    const parsed = Number(token);
    if (!Number.isSafeInteger(parsed)) {
      return { ok: false, error: `Malformed .npy header: integer out of range (${token}).` };
    }
    this.pos += token.length;
    return { ok: true, value: parsed };
  }

  private parseKeyword(): { readonly ok: true; readonly value: boolean | null } | { readonly ok: false; readonly error: string } {
    const slice = this.text.slice(this.pos);
    const match = slice.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (!match) {
      return { ok: false, error: `Malformed .npy header: unexpected token at offset ${this.pos}.` };
    }
    const word = match[0];
    this.pos += word.length;
    if (word === "True") return { ok: true, value: true };
    if (word === "False") return { ok: true, value: false };
    if (word === "None") return { ok: true, value: null };
    return { ok: false, error: `Malformed .npy header: unsupported literal "${word}".` };
  }
}

// ---------------------------------------------------------------------------
// Dtype decoding & header inspection
// ---------------------------------------------------------------------------

type NpyDtypeKind =
  | "f2"
  | "f4"
  | "f8"
  | "i1"
  | "u1"
  | "i2"
  | "u2"
  | "i4"
  | "u4"
  | "i8"
  | "u8"
  | "c8"
  | "c16";

interface NpyDtypeSpec {
  readonly descr: string;
  readonly kind: NpyDtypeKind;
  readonly elemBytes: number;
  readonly littleEndian: boolean;
  readonly isComplex: boolean;
}

const SUPPORTED_DTYPES: Readonly<Record<string, { readonly kind: NpyDtypeKind; readonly elemBytes: number; readonly isComplex: boolean }>> = {
  f2: { kind: "f2", elemBytes: 2, isComplex: false },
  f4: { kind: "f4", elemBytes: 4, isComplex: false },
  f8: { kind: "f8", elemBytes: 8, isComplex: false },
  i1: { kind: "i1", elemBytes: 1, isComplex: false },
  u1: { kind: "u1", elemBytes: 1, isComplex: false },
  i2: { kind: "i2", elemBytes: 2, isComplex: false },
  u2: { kind: "u2", elemBytes: 2, isComplex: false },
  i4: { kind: "i4", elemBytes: 4, isComplex: false },
  u4: { kind: "u4", elemBytes: 4, isComplex: false },
  i8: { kind: "i8", elemBytes: 8, isComplex: false },
  u8: { kind: "u8", elemBytes: 8, isComplex: false },
  c8: { kind: "c8", elemBytes: 8, isComplex: true },
  c16: { kind: "c16", elemBytes: 16, isComplex: true },
};

function parseNpyDtype(descr: string): { readonly ok: true; readonly dtype: NpyDtypeSpec } | { readonly ok: false; readonly error: string } {
  const match = descr.match(/^([<>|=])([a-zA-Z])(\d+)$/);
  if (!match) {
    return { ok: false, error: `Unsupported .npy dtype "${descr}".` };
  }
  const endianPrefix = match[1];
  const kindChar = match[2];
  const sizeDigits = match[3];
  if (!endianPrefix || !kindChar || !sizeDigits) {
    return { ok: false, error: `Unsupported .npy dtype "${descr}".` };
  }
  const code = `${kindChar}${sizeDigits}`;
  const spec = SUPPORTED_DTYPES[code];
  if (!spec) {
    return { ok: false, error: `Unsupported .npy dtype "${descr}".` };
  }
  if (endianPrefix === "|" && spec.elemBytes > 1) {
    return { ok: false, error: `Unsupported .npy dtype "${descr}".` };
  }
  const littleEndian = endianPrefix === "<"
    ? true
    : endianPrefix === ">"
      ? false
      : endianPrefix === "|"
        ? true
        : HOST_LITTLE_ENDIAN;

  return {
    ok: true,
    dtype: {
      descr,
      kind: spec.kind,
      elemBytes: spec.elemBytes,
      littleEndian,
      isComplex: spec.isComplex,
    },
  };
}

function readRealSample(view: DataView, byteOffset: number, dtype: NpyDtypeSpec): number {
  const le = dtype.littleEndian;
  switch (dtype.kind) {
    case "f2": return decodeFloat16(view.getUint16(byteOffset, le));
    case "f4": return view.getFloat32(byteOffset, le);
    case "f8": return view.getFloat64(byteOffset, le);
    case "i1": return view.getInt8(byteOffset);
    case "u1": return view.getUint8(byteOffset);
    case "i2": return view.getInt16(byteOffset, le);
    case "u2": return view.getUint16(byteOffset, le);
    case "i4": return view.getInt32(byteOffset, le);
    case "u4": return view.getUint32(byteOffset, le);
    case "i8": return Number(view.getBigInt64(byteOffset, le));
    case "u8": return Number(view.getBigUint64(byteOffset, le));
    case "c8": return view.getFloat32(byteOffset, le);
    case "c16": return view.getFloat64(byteOffset, le);
  }
}

function readImagSample(view: DataView, byteOffset: number, dtype: NpyDtypeSpec): number {
  const le = dtype.littleEndian;
  if (dtype.kind === "c8") return view.getFloat32(byteOffset + 4, le);
  if (dtype.kind === "c16") return view.getFloat64(byteOffset + 8, le);
  return 0;
}

function formatShape(shape: readonly number[]): string {
  if (shape.length === 1) return `(${shape[0] ?? 0},)`;
  return `(${shape.join(", ")})`;
}

interface NpyInspectedHeader {
  readonly view: DataView;
  readonly major: number;
  readonly minor: number;
  readonly headerText: string;
  readonly dtype: NpyDtypeSpec;
  readonly fortranOrder: boolean;
  readonly shape: readonly number[];
  readonly channelCount: number;
  readonly sampleCount: number;
  readonly interleaved: boolean;
  readonly dataOffset: number;
}

/** One number is a value, not a waveform (for example a SPICE operating-point result saved one file per signal). */
const SINGLE_VALUE_MESSAGE = "This .npy file holds a single value, so it can't be drawn as a trace: a trace needs at least 2 samples. "
  + "Open the array it belongs to (the sweep, time or frequency axis and the signals measured along it) instead.";

function inspectNpyBin(buffer: ArrayBuffer): { readonly ok: true; readonly info: NpyInspectedHeader } | { readonly ok: false; readonly error: string } {
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength < 10) {
    return { ok: false, error: "NumPy .npy file is truncated." };
  }
  for (let i = 0; i < NPY_MAGIC.length; i++) {
    if (bytes[i] !== NPY_MAGIC[i]) {
      return { ok: false, error: "Unrecognized NumPy .npy magic header." };
    }
  }

  const view = new DataView(buffer);
  const major = view.getUint8(6);
  const minor = view.getUint8(7);

  let headerLen: number;
  let headerStart: number;
  if (major === 1) {
    headerLen = view.getUint16(8, true);
    headerStart = 10;
  } else if (major === 2 || major === 3) {
    if (bytes.byteLength < 12) {
      return { ok: false, error: "NumPy .npy v2/v3 header is truncated." };
    }
    headerLen = view.getUint32(8, true);
    headerStart = 12;
  } else {
    return { ok: false, error: `Unsupported NumPy .npy format version ${major}.${minor}.` };
  }

  if (headerLen === 0 || headerLen > MAX_NPY_HEADER_BYTES) {
    return { ok: false, error: `Invalid .npy header length (${headerLen} bytes).` };
  }
  const dataOffset = headerStart + headerLen;
  if (dataOffset > buffer.byteLength) {
    return { ok: false, error: "Truncated .npy header: extends past end of file." };
  }
  if (dataOffset === buffer.byteLength) {
    return { ok: false, error: "Truncated .npy file: no sample data after header." };
  }

  const encoding = major >= 3 ? "utf-8" : "latin1";
  const headerText = new TextDecoder(encoding).decode(bytes.subarray(headerStart, dataOffset)).trim();
  const parsedDict = new PyLiteralParser(headerText).parseRootDict();
  if (!parsedDict.ok) {
    return { ok: false, error: parsedDict.error };
  }

  const descrVal = parsedDict.entries.get("descr");
  if (descrVal === undefined) {
    return { ok: false, error: "Malformed .npy header: missing 'descr'." };
  }
  if (typeof descrVal !== "string") {
    return { ok: false, error: "Unsupported .npy structured dtype (expected scalar dtype string)." };
  }
  const dtypeRes = parseNpyDtype(descrVal);
  if (!dtypeRes.ok) {
    return { ok: false, error: dtypeRes.error };
  }

  const fortranVal = parsedDict.entries.get("fortran_order");
  if (typeof fortranVal !== "boolean") {
    return { ok: false, error: "Malformed .npy header: invalid or missing 'fortran_order'." };
  }

  const shapeVal = parsedDict.entries.get("shape");
  if (typeof shapeVal !== "object" || shapeVal === null || shapeVal.kind !== "tuple") {
    return { ok: false, error: "Malformed .npy header: invalid or missing 'shape'." };
  }

  const shape: number[] = [];
  for (const dim of shapeVal.items) {
    if (typeof dim !== "number" || !Number.isSafeInteger(dim) || dim < 0) {
      return { ok: false, error: "Malformed .npy header: 'shape' must contain non-negative integers." };
    }
    shape.push(dim);
  }

  if (shape.length === 0) {
    return { ok: false, error: SINGLE_VALUE_MESSAGE };
  }
  if (shape.length > 2) {
    return { ok: false, error: `${shape.length}D .npy arrays are not supported (expected 1D or 2D).` };
  }

  let channelCount: number;
  let sampleCount: number;
  let interleaved: boolean;

  if (shape.length === 1) {
    const n = shape[0] ?? 0;
    if (n < 2) {
      return { ok: false, error: n === 1 ? SINGLE_VALUE_MESSAGE : "This .npy array is empty, so there is nothing to plot." };
    }
    channelCount = 1;
    sampleCount = n;
    interleaved = false;
  } else {
    const rows = shape[0] ?? 0;
    const cols = shape[1] ?? 0;
    if (rows <= MAX_CHANNELS && cols > MAX_CHANNELS) {
      channelCount = rows;
      sampleCount = cols;
      interleaved = fortranVal;
    } else {
      sampleCount = rows;
      channelCount = cols;
      interleaved = !fortranVal;
    }
    if (channelCount < 1) {
      return { ok: false, error: "2D .npy array has 0 channels." };
    }
    if (channelCount > MAX_CHANNELS) {
      return { ok: false, error: `2D .npy array has ${channelCount} channels (maximum supported is ${MAX_CHANNELS}).` };
    }
    if (sampleCount < 2) {
      return { ok: false, error: sampleCount === 1
        ? "This 2D .npy array has a single sample per channel, so it can't be drawn as a trace: a trace needs at least 2 samples."
        : "This 2D .npy array is empty, so there is nothing to plot." };
    }
  }

  const totalElements = sampleCount * channelCount;
  const totalBytes = totalElements * dtypeRes.dtype.elemBytes;
  if (!Number.isSafeInteger(totalElements) || !Number.isSafeInteger(totalBytes)) {
    return { ok: false, error: ".npy array dimensions exceed safe byte-size bounds." };
  }
  if (dataOffset + totalBytes > buffer.byteLength) {
    return {
      ok: false,
      error: `.npy data payload exceeds file bounds (expected ${totalBytes} bytes at offset ${dataOffset}, got ${buffer.byteLength - dataOffset}).`,
    };
  }

  return {
    ok: true,
    info: {
      view,
      major,
      minor,
      headerText,
      dtype: dtypeRes.dtype,
      fortranOrder: fortranVal,
      shape,
      channelCount,
      sampleCount,
      interleaved,
      dataOffset,
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Header-only probe returning total sample points across all output traces without allocating sample arrays. */
export function probeNpyBinPoints(buffer: ArrayBuffer): ScopeProbeResult {
  const inspected = inspectNpyBin(buffer);
  if (!inspected.ok) return { ok: false, error: inspected.error };
  const { channelCount, sampleCount, dtype } = inspected.info;
  const outputTraceCount = dtype.isComplex ? channelCount * 2 : channelCount;
  return { ok: true, totalPoints: outputTraceCount * sampleCount };
}

/** Parse a NumPy .npy v1.0 / v2.0 / v3.0 binary array into waveform traces. */
export function parseNpyBin(
  buffer: ArrayBuffer,
  fileName: string,
  options: BinaryParseOptions = {},
): BinaryParseResult {
  const inspected = inspectNpyBin(buffer);
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
    return { ok: false, error: "Selected .npy slice contains fewer than 2 samples." };
  }

  const fileSerial = incrementFileCounter();
  const prefix = `${fileName.replace(/\.[^.]+$/, "")} `;
  const traces: RawTrace[] = [];
  const columnIdentities: ColumnIdentity[] = [];
  const expectedOutputTraces = info.dtype.isComplex ? info.channelCount * 2 : info.channelCount;
  let decimatedNote: string | null = null;

  const appendTrace = (label: string, readSample: (sliceRelativeIndex: number) => number): void => {
    const reduced = reduceBinarySeries({
      count: sliceCount,
      xStart: sliceStart,
      dt: 1,
      readY: readSample,
      reduction: options.reduction,
    });
    if (reduced.decimationNote) {
      decimatedNote = expectedOutputTraces > 1
        ? `${reduced.decimationNote} (per ch)`
        : reduced.decimationNote;
    }

    const normalized = normalizeTraceData(reduced.points);
    if (normalized.length < 2) return;

    traces.push({
      ...makeTrace(prefix, fileName, label, fileSerial),
      domain: "time",
      family: "waveform",
      isUniform: reduced.isUniform,
      ...(reduced.envelopeOf !== undefined ? { envelopeOf: reduced.envelopeOf } : {}),
      dn: `${fileName} ${label}`,
      units: { x: "unitless", y: null },
      data: normalized,
    });
    columnIdentities.push({ index: traces.length - 1, header: label });
  };

  for (let ch = 0; ch < info.channelCount; ch++) {
    const elemByteOffset = (sample: number): number => {
      const elemIdx = info.interleaved
        ? sample * info.channelCount + ch
        : ch * info.sampleCount + sample;
      return info.dataOffset + elemIdx * info.dtype.elemBytes;
    };

    if (info.dtype.isComplex) {
      const iLabel = info.channelCount === 1 ? "I" : `CH${ch + 1} I`;
      const qLabel = info.channelCount === 1 ? "Q" : `CH${ch + 1} Q`;
      appendTrace(iLabel, (idx) => readRealSample(info.view, elemByteOffset(sliceStart + idx), info.dtype));
      appendTrace(qLabel, (idx) => readImagSample(info.view, elemByteOffset(sliceStart + idx), info.dtype));
    } else {
      const label = `CH${ch + 1}`;
      appendTrace(label, (idx) => readRealSample(info.view, elemByteOffset(sliceStart + idx), info.dtype));
    }
  }

  if (traces.length === 0) {
    return { ok: false, error: "No finite waveform samples were found in this .npy file." };
  }

  const meta: Record<string, MetadataEntry> = {
    Format: `NumPy (.npy v${info.major}.${info.minor})`,
    Dtype: info.dtype.descr,
    Shape: formatShape(info.shape),
    Order: info.fortranOrder ? "Fortran" : "C",
    Channels: String(traces.length),
    Points: String(info.sampleCount),
  };
  if (decimatedNote) {
    meta["Decimation"] = decimatedNote;
  }

  const datasets = traces.map((trace) => buildSeriesDatasetFromTrace(trace, "waveform"));
  const displayTraces: ScalarDisplayTrace[] = [];
  for (const [index, trace] of traces.entries()) {
    const dataset = datasets[index];
    const firstSeries = dataset?.series[0];
    if (!dataset || !firstSeries) continue;
    displayTraces.push(buildScalarDisplayTraceFromSeriesDataset(dataset, firstSeries, trace));
  }

  const parsed: ParsedFile = {
    format: "npy",
    meta: meta as FileMetadata,
    traces,
    datasets,
    displayTraces,
    columnIdentities,
    rawText: info.headerText,
  };

  return { ok: true, parsed, summaryText: info.headerText };
}
