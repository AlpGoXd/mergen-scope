// ============================================================================
// Mergen Scope — Touchstone Parser (Touchstone 2.1 Specification)
// ============================================================================
// Ported from: app-modules/parser-helpers.js (parseTouchstone)
// Updated for Touchstone 2.1 conformance and Y/Z/H/G -> S conversion.
// ============================================================================

import type { ParsedFile, FileMetadata } from "../../types/file.ts";
import type {
  TouchstoneNetwork,
  TouchstoneSample,
  TouchstoneDataFormat,
  TouchstoneParameterType,
  MatrixFormat,
  Complex,
  ComplexMatrix,
} from "../../types/touchstone.ts";

import {
  buildTouchstoneMatrixOrder,
  convertGMatrixToSMatrix,
  convertHMatrixToSMatrix,
  convertYMatrixToSMatrix,
  convertZMatrixToSMatrix,
  expandTouchstoneOrderedValuesToMatrix,
  normalizeReferenceArray,
  touchstonePairToComplex,
  type TwoPortDataOrder,
} from "../touchstone-math.ts";
import { buildNetworkDatasetFromTouchstone } from "../dataset-builders.ts";
import { incrementFileCounter } from "./rs-dat.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_TOUCHSTONE_PORTS = 256;

function getTouchstonePortCountFromFileName(fileName: string): number | null {
  const port = String(fileName ?? "").match(/\.s(\d+)p$/i)?.[1];
  return port === undefined ? null : Math.max(1, parseInt(port, 10));
}

/** One decimal number written with a comma, as localized exporters do (NanoVNA-App on a tr/de/fr Windows: `9,27e-01`). */
const DECIMAL_COMMA_NUMBER = /^[+-]?(?:\d+,\d*|,\d+)(?:e[+-]?\d+)?$/i;

/** A Touchstone number token; NaN when it is neither a plain number nor a single decimal-comma number. */
function parseTouchstoneNumber(token: string): number {
  const value = Number(token);
  if (Number.isFinite(value)) return value;
  return DECIMAL_COMMA_NUMBER.test(token) ? Number(token.replace(",", ".")) : Number.NaN;
}

/**
 * Tokenize a numeric Touchstone line (network data, [Reference], or noise data).
 * Supports whitespace separation, decimal-comma numbers (`9,27e-01`), comma-space
 * delimiters (`1e9, -10.5, 45.2`), and comma-delimited dot-decimal tokens (`1000,0.1,0.2`).
 */
function tokenizeTouchstoneNumericLine(trimmed: string, lineNum: number): number[] {
  const normalized = trimmed.replace(/,\s+/g, " ");
  const nums: number[] = [];
  for (const token of normalized.split(/\s+/)) {
    if (!token) continue;
    const value = parseTouchstoneNumber(token);
    if (Number.isFinite(value)) {
      nums.push(value);
      continue;
    }
    if (token.includes(",") && token.includes(".")) {
      const parts = token.split(",");
      for (const part of parts) {
        if (!part) {
          throw new Error(`Touchstone line ${lineNum} has an unreadable number '${token.slice(0, 40)}'.`);
        }
        const partValue = parseTouchstoneNumber(part);
        if (!Number.isFinite(partValue)) {
          throw new Error(`Touchstone line ${lineNum} has an unreadable number '${part.slice(0, 40)}'.`);
        }
        nums.push(partValue);
      }
      continue;
    }
    // Dropping a bad token would shift every later value into the wrong column.
    throw new Error(`Touchstone line ${lineNum} has an unreadable number '${token.slice(0, 40)}'.`);
  }
  return nums;
}

interface DataLine {
  readonly lineNum: number;
  readonly nums: readonly number[];
}

interface ParserState {
  version: number;
  versionString: string;
  sawVersion: boolean;
  portCount: number | null;
  sawNumberOfPorts: boolean;
  twoPortDataOrder: TwoPortDataOrder | null;
  sawTwoPortDataOrder: boolean;
  parameterType: TouchstoneParameterType;
  dataFormat: TouchstoneDataFormat;
  freqUnit: string;
  optionReferences: number[];
  referenceOhms: number[] | null;
  sawReference: boolean;
  readingReference: boolean;
  matrixFormat: MatrixFormat;
  sawMatrixFormat: boolean;
  inInformation: boolean;
  sawBeginInformation: boolean;
  sawEndInformation: boolean;
  inNetworkData: boolean;
  sawNetworkData: boolean;
  inNoiseData: boolean;
  sawNoiseData: boolean;
  ended: boolean;
  sawOptionLine: boolean;
  expectedFrequencyCount: number | null;
  expectedNoiseFrequencyCount: number | null;
}

function isOptionKeywordToken(upper: string): boolean {
  return (
    upper === "HZ" ||
    upper === "KHZ" ||
    upper === "MHZ" ||
    upper === "GHZ" ||
    upper === "S" ||
    upper === "Y" ||
    upper === "Z" ||
    upper === "G" ||
    upper === "H" ||
    upper === "DB" ||
    upper === "MA" ||
    upper === "RI" ||
    upper === "R"
  );
}

function parseTouchstoneOptionLine(trimmed: string, state: ParserState, lineNum: number): void {
  const tokens = trimmed.slice(1).trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) throw new Error("Missing Touchstone option token.");
    const upper = token.toUpperCase();
    if (upper === "HZ" || upper === "KHZ" || upper === "MHZ" || upper === "GHZ") {
      state.freqUnit = upper === "HZ" ? "Hz" : upper === "KHZ" ? "kHz" : upper === "MHZ" ? "MHz" : "GHz";
      continue;
    }
    if (upper === "S" || upper === "Y" || upper === "Z" || upper === "G" || upper === "H") {
      state.parameterType = upper as TouchstoneParameterType;
      continue;
    }
    if (upper === "DB" || upper === "MA" || upper === "RI") {
      state.dataFormat = upper as TouchstoneDataFormat;
      continue;
    }
    if (upper === "R") {
      i++;
      if (i >= tokens.length) throw new Error("Touchstone option line is missing a reference value after R.");
      const firstRef = parseTouchstoneNumber(tokens[i] ?? "");
      if (!Number.isFinite(firstRef) || firstRef <= 0) {
        throw new Error("Touchstone reference resistance must be a real positive number.");
      }
      const refs: number[] = [firstRef];
      // Spec (Version 1.1 / TSIRD 5.1): R may be followed by one value per port at the end of the option line.
      while (i + 1 < tokens.length) {
        const nextToken = tokens[i + 1] ?? "";
        const nextUpper = nextToken.toUpperCase();
        if (isOptionKeywordToken(nextUpper)) {
          if (refs.length > 1) {
            throw new Error(
              `Touchstone per-port option-line reference (R n1 ... np) must appear at the end of the option line (line ${lineNum}).`,
            );
          }
          break;
        }
        const nextVal = parseTouchstoneNumber(nextToken);
        if (Number.isFinite(nextVal)) {
          if (nextVal <= 0) {
            throw new Error("Touchstone reference resistance must be a real positive number.");
          }
          refs.push(nextVal);
          i++;
          continue;
        }
        if (/^(?:[+-]?infinity|nan)$/i.test(nextToken)) {
          throw new Error("Touchstone reference resistance must be a real positive number.");
        }
        throw new Error(`Unsupported Touchstone option token: ${nextToken}`);
      }
      if (refs.length > 1 && state.version >= 2) {
        throw new Error(
          `Touchstone Version 2 option line supports only a single reference resistance (line ${lineNum}); use [Reference] for per-port values.`,
        );
      }
      state.optionReferences = refs;
      if (refs.length > 1 && state.version === 1) {
        state.versionString = "1.1";
      }
      continue;
    }
    throw new Error(`Unsupported Touchstone option token: ${token}`);
  }
}

function parsePositiveIntArg(arg: string): number | null {
  const trimmed = arg.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function parseTouchstoneKeyword(trimmed: string, state: ParserState, lineNum: number): boolean {
  const match = trimmed.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (!match) return false;
  const [, name, argument] = match;
  if (name === undefined || argument === undefined) return false;
  const keyword = name.trim().toLowerCase();
  const arg = argument.trim();

  if (keyword === "version") {
    if (state.sawVersion) {
      throw new Error(`Duplicate Touchstone [Version] keyword on line ${lineNum}.`);
    }
    if (arg !== "2.0" && arg !== "2.1") {
      throw new Error(`Unsupported Touchstone [Version] '${arg}' on line ${lineNum}. Expected 2.0 or 2.1.`);
    }
    state.sawVersion = true;
    state.version = 2;
    state.versionString = arg;
    return true;
  }
  if (keyword === "number of ports") {
    if (state.sawNumberOfPorts) {
      throw new Error(`Duplicate Touchstone [Number of Ports] keyword on line ${lineNum}.`);
    }
    const n = parsePositiveIntArg(arg);
    if (n === null || n > MAX_TOUCHSTONE_PORTS) {
      throw new Error(`Touchstone [Number of Ports] must be a positive integer (1..${MAX_TOUCHSTONE_PORTS}) on line ${lineNum}.`);
    }
    state.sawNumberOfPorts = true;
    state.portCount = n;
    return true;
  }
  if (keyword === "two-port data order") {
    if (state.sawTwoPortDataOrder) {
      throw new Error(`Duplicate Touchstone [Two-Port Data Order] keyword on line ${lineNum}.`);
    }
    if (arg !== "12_21" && arg !== "21_12") {
      throw new Error(
        `Invalid Touchstone [Two-Port Data Order] argument '${arg}' on line ${lineNum}. Expected '12_21' or '21_12'.`,
      );
    }
    state.sawTwoPortDataOrder = true;
    state.twoPortDataOrder = arg;
    return true;
  }
  if (keyword === "reference") {
    if (state.sawReference) {
      throw new Error(`Duplicate Touchstone [Reference] keyword on line ${lineNum}.`);
    }
    state.sawReference = true;
    state.readingReference = true;
    state.referenceOhms = [];
    if (arg) {
      const refs = tokenizeTouchstoneNumericLine(arg, lineNum);
      for (const v of refs) {
        if (!Number.isFinite(v) || v <= 0) {
          throw new Error(`Touchstone [Reference] values must be real positive numbers (line ${lineNum}).`);
        }
      }
      state.referenceOhms.push(...refs);
    }
    return true;
  }
  if (keyword === "begin information") {
    if (state.sawBeginInformation) {
      throw new Error(`Duplicate Touchstone [Begin Information] keyword on line ${lineNum}.`);
    }
    state.sawBeginInformation = true;
    state.inInformation = true;
    return true;
  }
  if (keyword === "end information") {
    throw new Error(`Touchstone [End Information] encountered without matching [Begin Information] on line ${lineNum}.`);
  }
  if (keyword === "network data") {
    if (state.sawNetworkData) {
      throw new Error(`Duplicate Touchstone [Network Data] keyword on line ${lineNum}.`);
    }
    state.sawNetworkData = true;
    state.inNetworkData = true;
    state.inNoiseData = false;
    return true;
  }
  if (keyword === "noise data") {
    if (state.sawNoiseData) {
      throw new Error(`Duplicate Touchstone [Noise Data] keyword on line ${lineNum}.`);
    }
    if (!state.sawNetworkData) {
      throw new Error(`Touchstone [Noise Data] must appear after [Network Data] on line ${lineNum}.`);
    }
    state.sawNoiseData = true;
    state.inNetworkData = false;
    state.inNoiseData = true;
    return true;
  }
  if (keyword === "end") {
    state.ended = true;
    state.inNetworkData = false;
    state.inNoiseData = false;
    return true;
  }
  if (keyword === "matrix format") {
    if (state.sawMatrixFormat) {
      throw new Error(`Duplicate Touchstone [Matrix Format] keyword on line ${lineNum}.`);
    }
    const fmt = arg.toLowerCase();
    if (fmt !== "full" && fmt !== "upper" && fmt !== "lower") {
      throw new Error(`Unsupported Touchstone matrix format '${arg}' on line ${lineNum}.`);
    }
    state.sawMatrixFormat = true;
    state.matrixFormat = fmt as MatrixFormat;
    return true;
  }
  if (keyword === "number of frequencies") {
    const count = parsePositiveIntArg(arg);
    if (count === null) {
      throw new Error(`Touchstone [Number of Frequencies] must be a positive integer on line ${lineNum}.`);
    }
    state.expectedFrequencyCount = count;
    return true;
  }
  if (keyword === "number of noise frequencies") {
    const count = parsePositiveIntArg(arg);
    if (count === null) {
      throw new Error(`Touchstone [Number of Noise Frequencies] must be a positive integer on line ${lineNum}.`);
    }
    state.expectedNoiseFrequencyCount = count;
    return true;
  }
  if (keyword === "mixed-mode order") {
    throw new Error("Mixed-mode Touchstone files are not supported yet.");
  }
  return true;
}

// ---------------------------------------------------------------------------
// Touchstone parser
// ---------------------------------------------------------------------------

/**
 * Port count of a v1 file without an .sNp name: one row per frequency of 1 + 2·N² numbers.
 * 1- and 2-port rows fit on one line (2-port may also be followed by 5-value noise rows);
 * 4+ port files also have 9 values on their first line, so check subsequent line lengths
 * and rising-frequency strides to distinguish 2-port from 4+ port files.
 */
function inferTouchstonePortCount(networkLines: readonly DataLine[]): number | null {
  const firstLine = networkLines[0];
  if (!firstLine) return null;
  const firstLineCount = firstLine.nums.length;
  const secondLine = networkLines[1];

  if (firstLineCount === 3) return 1;
  if (
    firstLineCount === 9 &&
    (!secondLine ||
      secondLine.nums.length === 9 ||
      (secondLine.nums.length === 5 && (secondLine.nums[0] ?? Infinity) <= (firstLine.nums[0] ?? -Infinity)))
  ) {
    return 2;
  }

  const tokens: number[] = [];
  for (const line of networkLines) {
    for (const value of line.nums) tokens.push(value);
  }
  for (let ports = 3; ports <= 16; ports++) {
    const stride = 1 + 2 * ports * ports;
    if (tokens.length < stride || tokens.length % stride !== 0) continue;
    let rising = true;
    for (let i = stride; i < tokens.length && rising; i += stride) {
      rising = (tokens[i] ?? 0) > (tokens[i - stride] ?? 0);
    }
    if (rising) return ports;
  }
  return null;
}

function convertSampleMatrixToS(
  matrix: ComplexMatrix,
  parameterType: TouchstoneParameterType,
  referenceOhms: readonly number[],
  version: number,
  freqValue: number,
  freqUnit: string,
  freqHz: number,
): ComplexMatrix {
  if (parameterType === "S") return matrix;
  // Spec "Compatibility notes": v1.0/v1.1 G/H/Y/Z values are normalized to R; v2.0/v2.1 are unnormalized.
  const normalized = version === 1;
  let converted: Complex[][] | null = null;
  if (parameterType === "Z") {
    converted = convertZMatrixToSMatrix(matrix, referenceOhms, normalized);
  } else if (parameterType === "Y") {
    converted = convertYMatrixToSMatrix(matrix, referenceOhms, normalized);
  } else if (parameterType === "H") {
    converted = convertHMatrixToSMatrix(matrix, referenceOhms, normalized);
  } else if (parameterType === "G") {
    converted = convertGMatrixToSMatrix(matrix, referenceOhms, normalized);
  }
  if (!converted) {
    throw new Error(
      `Touchstone ${parameterType}-to-S conversion encountered a singular matrix at frequency ${freqValue} ${freqUnit} (${freqHz} Hz).`,
    );
  }
  return converted;
}

/** Parse a Touchstone (.sNp / .ts) file. */
export function parseTouchstoneFile(text: string, fileName: string): ParsedFile {
  incrementFileCounter();
  const textStr = String(text ?? "");
  const fileNameStr = String(fileName ?? "touchstone.s2p");
  const lines = textStr.split(/\r?\n/);
  const comments: string[] = [];

  const state: ParserState = {
    version: 1,
    versionString: "1.0",
    sawVersion: false,
    portCount: getTouchstonePortCountFromFileName(fileNameStr),
    sawNumberOfPorts: false,
    twoPortDataOrder: null,
    sawTwoPortDataOrder: false,
    parameterType: "S",
    dataFormat: "MA",
    freqUnit: "GHz",
    optionReferences: [50],
    referenceOhms: null,
    sawReference: false,
    readingReference: false,
    matrixFormat: "full",
    sawMatrixFormat: false,
    inInformation: false,
    sawBeginInformation: false,
    sawEndInformation: false,
    inNetworkData: false,
    sawNetworkData: false,
    inNoiseData: false,
    sawNoiseData: false,
    ended: false,
    sawOptionLine: false,
    expectedFrequencyCount: null,
    expectedNoiseFrequencyCount: null,
  };

  const networkLines: DataLine[] = [];
  const noiseLines: DataLine[] = [];

  for (const [lineIndex, rawLine] of lines.entries()) {
    const lineNum = lineIndex + 1;
    let raw = rawLine.replace(/^\uFEFF/, "");
    const commentIndex = raw.indexOf("!");
    if (commentIndex >= 0) {
      const comment = raw.slice(commentIndex + 1).trim();
      if (comment) comments.push(comment);
      raw = raw.slice(0, commentIndex);
    }
    const trimmed = raw.trim();
    if (!trimmed || state.ended) continue;

    if (state.inInformation) {
      if (/^\[end\s+information\]$/i.test(trimmed)) {
        state.inInformation = false;
        state.sawEndInformation = true;
      }
      continue;
    }

    if (state.readingReference) {
      if (trimmed.charAt(0) === "[" || trimmed.charAt(0) === "#") {
        if (!state.referenceOhms || state.referenceOhms.length === 0) {
          throw new Error("Touchstone [Reference] must include at least one real positive value.");
        }
        state.readingReference = false;
      } else {
        const refs = tokenizeTouchstoneNumericLine(trimmed, lineNum);
        for (const v of refs) {
          if (!Number.isFinite(v) || v <= 0) {
            throw new Error(`Touchstone [Reference] values must be real positive numbers (line ${lineNum}).`);
          }
        }
        state.referenceOhms?.push(...refs);
        continue;
      }
    }

    if (trimmed.charAt(0) === "[") {
      parseTouchstoneKeyword(trimmed, state, lineNum);
      continue;
    }
    if (trimmed.charAt(0) === "#") {
      if (!state.sawOptionLine) {
        parseTouchstoneOptionLine(trimmed, state, lineNum);
        state.sawOptionLine = true;
      }
      continue;
    }
    if (!state.sawOptionLine) {
      throw new Error("Touchstone data encountered before the option line.");
    }
    if (state.version >= 2 && !state.inNetworkData && !state.inNoiseData) {
      throw new Error(`Touchstone Version 2 data encountered before [Network Data] on line ${lineNum}.`);
    }

    const nums = tokenizeTouchstoneNumericLine(trimmed, lineNum);
    if (state.inNoiseData) {
      noiseLines.push({ lineNum, nums });
    } else {
      networkLines.push({ lineNum, nums });
    }
  }

  if (state.inInformation) {
    throw new Error("Touchstone [Begin Information] is missing a closing [End Information].");
  }
  if (state.readingReference && (!state.referenceOhms || state.referenceOhms.length === 0)) {
    throw new Error("Touchstone [Reference] must include at least one real positive value.");
  }
  if (!state.sawOptionLine) {
    throw new Error("Touchstone file is missing an option line.");
  }

  // Opened by content under another name (.ts / .txt): infer the port count from the data layout.
  const portCount = state.portCount ?? inferTouchstonePortCount(networkLines);
  if (!portCount) {
    throw new Error("Unable to determine the Touchstone port count.");
  }
  const filePortCount = getTouchstonePortCountFromFileName(fileNameStr);
  if (filePortCount && filePortCount !== portCount) {
    throw new Error("Touchstone port count does not match the file extension.");
  }

  if (state.twoPortDataOrder !== null && portCount !== 2) {
    throw new Error(`Touchstone [Two-Port Data Order] is only valid for 2-port files (got ${portCount} ports).`);
  }
  if ((state.parameterType === "H" || state.parameterType === "G") && portCount !== 2) {
    throw new Error(
      `Touchstone ${state.parameterType}-parameters are only defined for 2-port networks (got ${portCount} ports).`,
    );
  }
  if (state.optionReferences.length > 1 && state.optionReferences.length !== portCount) {
    throw new Error(
      `Touchstone option-line reference count (${state.optionReferences.length}) does not match port count (${portCount}).`,
    );
  }
  if (state.sawReference) {
    const refLen = state.referenceOhms?.length ?? 0;
    if (refLen === 0) {
      throw new Error("Touchstone [Reference] must include at least one real positive value.");
    }
    if (refLen !== portCount) {
      throw new Error(`Touchstone [Reference] count (${refLen}) does not match port count (${portCount}).`);
    }
  }
  if ((state.sawNoiseData || state.expectedNoiseFrequencyCount !== null) && portCount !== 2) {
    throw new Error(`Touchstone noise parameter data is only permitted for 2-port networks (got ${portCount} ports).`);
  }
  if (state.version >= 2 && state.expectedNoiseFrequencyCount !== null && !state.sawNoiseData) {
    throw new Error("Touchstone [Number of Noise Frequencies] requires a [Noise Data] section.");
  }

  const refs = normalizeReferenceArray(state.referenceOhms ?? state.optionReferences, portCount);
  if (!refs) throw new Error("Unsupported Touchstone reference format.");

  const effectiveTwoPortOrder: TwoPortDataOrder =
    portCount === 2 ? (state.twoPortDataOrder ?? "21_12") : "21_12";
  const order = buildTouchstoneMatrixOrder(portCount, state.matrixFormat, effectiveTwoPortOrder);
  const expectedPerSample = 1 + order.length * 2;
  const freqScaleMap: Record<string, number> = { Hz: 1, kHz: 1e3, MHz: 1e6, GHz: 1e9 };
  const freqScale = freqScaleMap[state.freqUnit] ?? 1e9;

  const samples: TouchstoneSample[] = [];
  let noiseCount = 0;

  const consumeSample = (tokens: readonly number[], startIdx: number): TouchstoneSample => {
    const freqValue = tokens[startIdx];
    if (freqValue === undefined) {
      throw new Error(`Incomplete Touchstone network data at frequency sample ${samples.length + 1}.`);
    }
    const freqHz = freqValue * freqScale;
    const values: Complex[] = [];
    for (let j = 0; j < order.length; j++) {
      const first = tokens[startIdx + 1 + j * 2];
      const second = tokens[startIdx + 2 + j * 2];
      if (first === undefined || second === undefined) {
        throw new Error(`Incomplete Touchstone network data at frequency sample ${samples.length + 1}.`);
      }
      values.push(touchstonePairToComplex(state.dataFormat, first, second));
    }
    const rawMatrix = expandTouchstoneOrderedValuesToMatrix(
      portCount,
      state.matrixFormat,
      values,
      effectiveTwoPortOrder,
    );
    if (!rawMatrix) throw new Error("Unable to reconstruct the Touchstone network matrix.");
    const sMatrix = convertSampleMatrixToS(
      rawMatrix,
      state.parameterType,
      refs,
      state.version,
      freqValue,
      state.freqUnit,
      freqHz,
    );
    return { freq: freqHz, sMatrix };
  };

  if (state.version === 1 && portCount === 2) {
    // Spec (v1.0/v1.1 2-port noise): noise block begins at the first data line whose frequency <= previous network frequency.
    const pending: number[] = [];
    let lastNetworkFreqRaw: number | null = null;
    let inV1Noise = false;

    for (const { lineNum, nums } of networkLines) {
      if (
        !inV1Noise &&
        pending.length === 0 &&
        lastNetworkFreqRaw !== null &&
        nums[0] !== undefined &&
        nums[0] <= lastNetworkFreqRaw
      ) {
        inV1Noise = true;
      }
      if (inV1Noise) {
        if (nums.length !== 5) {
          throw new Error(`Touchstone noise data on line ${lineNum} must have 5 values (got ${nums.length}).`);
        }
        noiseCount += 1;
        continue;
      }
      for (const value of nums) pending.push(value);
      while (pending.length >= expectedPerSample) {
        const freqRaw = pending[0];
        const sample = consumeSample(pending, 0);
        samples.push(sample);
        if (freqRaw !== undefined) lastNetworkFreqRaw = freqRaw;
        pending.splice(0, expectedPerSample);
      }
    }
    if (pending.length > 0) {
      throw new Error(`Incomplete Touchstone network data at frequency sample ${samples.length + 1}.`);
    }
  } else {
    const dataTokens: number[] = [];
    for (const line of networkLines) {
      for (const value of line.nums) dataTokens.push(value);
    }
    let idx = 0;
    while (idx < dataTokens.length) {
      if (idx + expectedPerSample > dataTokens.length) {
        throw new Error(`Incomplete Touchstone network data at frequency sample ${samples.length + 1}.`);
      }
      samples.push(consumeSample(dataTokens, idx));
      idx += expectedPerSample;
    }
    for (const { lineNum, nums } of noiseLines) {
      if (nums.length !== 5) {
        throw new Error(`Touchstone noise data on line ${lineNum} must have 5 values (got ${nums.length}).`);
      }
      noiseCount += 1;
    }
  }

  if (state.expectedFrequencyCount !== null && state.expectedFrequencyCount !== samples.length) {
    throw new Error("Touchstone [Number of Frequencies] does not match the parsed sample count.");
  }
  if (state.expectedNoiseFrequencyCount !== null && state.expectedNoiseFrequencyCount !== noiseCount) {
    throw new Error(
      `Touchstone [Number of Noise Frequencies] (${state.expectedNoiseFrequencyCount}) does not match the parsed noise sample count (${noiseCount}).`,
    );
  }

  const parameterTypeMeta =
    state.parameterType === "S" ? "S" : `${state.parameterType} (converted to S)`;

  const buildMeta = (): FileMetadata => {
    const meta: Record<string, string> = {
      "Format": "Touchstone",
      "Version": state.versionString,
      "Port Count": String(portCount),
      "Parameter Type": parameterTypeMeta,
      "Data Format": state.dataFormat,
      "Frequency Unit": state.freqUnit,
      "Reference": refs.length === 1 ? String(refs[0]) : refs.join(", "),
    };
    if (state.version >= 2 && portCount === 2) {
      meta["Two-Port Data Order"] =
        state.twoPortDataOrder ?? "21_12 (assumed, keyword missing)";
    }
    if (noiseCount > 0 || state.sawNoiseData) {
      meta["Noise Data"] = `${noiseCount} points (not displayed)`;
    }
    return meta;
  };

  const network: TouchstoneNetwork = {
    parameterType: "S",
    portCount,
    referenceOhms: refs.slice(),
    freqUnit: state.freqUnit,
    dataFormat: state.dataFormat,
    comments: comments.slice(),
    samples,
    matrixFormat: state.matrixFormat,
    version: state.version,
    cellOrder: "spec",
  };
  const networkDataset = buildNetworkDatasetFromTouchstone(network, fileNameStr);

  return {
    format: "touchstone",
    meta: buildMeta(),
    touchstoneNetwork: network,
    traces: [],
    datasets: [networkDataset],
    displayTraces: [],
  };
}
