// ============================================================================
// Mergen Scope — Touchstone Parser
// ============================================================================
// Ported from: app-modules/parser-helpers.js (parseTouchstone)
// ============================================================================

import type { ParsedFile, FileMetadata } from "../../types/file.ts";
import type {
  TouchstoneNetwork,
  TouchstoneSample,
  TouchstoneDataFormat,
  TouchstoneParameterType,
  MatrixFormat,
  Complex,
} from "../../types/touchstone.ts";

import {
  buildMatrixOrder,
  expandOrderedValuesToMatrix,
  normalizeReferenceArray,
  touchstonePairToComplex,
} from "../touchstone-math.ts";
import { incrementFileCounter } from "./rs-dat.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTouchstonePortCountFromFileName(fileName: string): number | null {
  const match = String(fileName ?? "").match(/\.s(\d+)p$/i);
  return match ? Math.max(1, parseInt(match[1]!, 10)) : null;
}


interface ParserState {
  version: number;
  versionString: string;
  portCount: number | null;
  parameterType: TouchstoneParameterType;
  dataFormat: TouchstoneDataFormat;
  freqUnit: string;
  optionReference: number;
  referenceOhms: number[] | null;
  matrixFormat: MatrixFormat;
  inNetworkData: boolean;
  ended: boolean;
  sawOptionLine: boolean;
  expectedFrequencyCount: number | null;
}

function parseTouchstoneOptionLine(trimmed: string, state: ParserState): void {
  const tokens = trimmed.slice(1).trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
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
      const ref = Number(tokens[i]);
      if (!Number.isFinite(ref) || ref <= 0) throw new Error("Touchstone reference resistance must be a real positive number.");
      state.optionReference = ref;
      continue;
    }
    throw new Error(`Unsupported Touchstone option token: ${token}`);
  }
  if (state.parameterType !== "S") {
    throw new Error(`Unsupported Touchstone parameter type '${state.parameterType}'. Only S-parameters are supported.`);
  }
}

function parseTouchstoneKeyword(trimmed: string, state: ParserState): boolean {
  const match = trimmed.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (!match) return false;
  const keyword = match[1]!.trim().toLowerCase();
  const arg = match[2]!.trim();

  if (keyword === "version") { state.version = 2; state.versionString = arg || "2.0"; return true; }
  if (keyword === "number of ports") {
    const n = parseInt(arg, 10);
    if (!Number.isFinite(n) || n <= 0) throw new Error("Touchstone [Number of Ports] must be a positive integer.");
    state.portCount = n;
    return true;
  }
  if (keyword === "reference") {
    const refs = arg.split(/\s+/).filter(Boolean).map(Number);
    if (!refs.length) throw new Error("Touchstone [Reference] must include at least one real positive value.");
    for (const v of refs) { if (!Number.isFinite(v) || v <= 0) throw new Error("Touchstone [Reference] values must be real positive numbers."); }
    state.referenceOhms = refs;
    return true;
  }
  if (keyword === "network data") { state.inNetworkData = true; return true; }
  if (keyword === "end") { state.ended = true; return true; }
  if (keyword === "matrix format") {
    const fmt = arg.trim().toLowerCase();
    if (fmt !== "full" && fmt !== "upper" && fmt !== "lower") throw new Error(`Unsupported Touchstone matrix format '${arg}'.`);
    state.matrixFormat = fmt as MatrixFormat;
    return true;
  }
  if (keyword === "number of frequencies") {
    const count = parseInt(arg, 10);
    if (Number.isFinite(count) && count > 0) state.expectedFrequencyCount = count;
    return true;
  }
  if (keyword === "mixed-mode order") throw new Error("Mixed-mode Touchstone files are not supported yet.");
  return true;
}

// ---------------------------------------------------------------------------
// Touchstone parser
// ---------------------------------------------------------------------------

/** Parse a Touchstone (.sNp) file. */
export function parseTouchstoneFile(text: string, fileName: string): ParsedFile {
  incrementFileCounter();
  const textStr = String(text ?? "");
  const fileNameStr = String(fileName ?? "touchstone.s2p");
  const lines = textStr.split(/\r?\n/);
  const comments: string[] = [];

  const state: ParserState = {
    version: 1, versionString: "1.0",
    portCount: getTouchstonePortCountFromFileName(fileNameStr),
    parameterType: "S", dataFormat: "MA", freqUnit: "GHz",
    optionReference: 50, referenceOhms: null,
    matrixFormat: "full", inNetworkData: false, ended: false,
    sawOptionLine: false, expectedFrequencyCount: null,
  };

  let dataTokens: number[] = [];

  for (const rawLine of lines) {
    let raw = rawLine.replace(/^\uFEFF/, "");
    const commentIndex = raw.indexOf("!");
    if (commentIndex >= 0) {
      const comment = raw.slice(commentIndex + 1).trim();
      if (comment) comments.push(comment);
      raw = raw.slice(0, commentIndex);
    }
    const trimmed = raw.trim();
    if (!trimmed || state.ended) continue;
    if (trimmed.charAt(0) === "[") { parseTouchstoneKeyword(trimmed, state); continue; }
    if (trimmed.charAt(0) === "#") { parseTouchstoneOptionLine(trimmed, state); state.sawOptionLine = true; continue; }
    if (!state.sawOptionLine) throw new Error("Touchstone data encountered before the option line.");
    const nums = trimmed.split(/\s+/).filter(Boolean).map(Number).filter(Number.isFinite);
    dataTokens = dataTokens.concat(nums);
  }

  if (!state.sawOptionLine) throw new Error("Touchstone file is missing an option line.");
  if (!state.portCount) throw new Error("Unable to determine the Touchstone port count.");
  const filePortCount = getTouchstonePortCountFromFileName(fileNameStr);
  if (filePortCount && filePortCount !== state.portCount) {
    throw new Error("Touchstone port count does not match the file extension.");
  }

  if (state.referenceOhms == null) state.referenceOhms = [state.optionReference];
  const refs = normalizeReferenceArray(state.referenceOhms, state.portCount);
  if (!refs) throw new Error("Unsupported Touchstone reference format.");
  state.referenceOhms = refs;

  const order = buildMatrixOrder(state.portCount, state.matrixFormat);
  const expectedPerSample = 1 + order.length * 2;

  const buildNetwork = (): TouchstoneNetwork => ({
    parameterType: state.parameterType,
    portCount: state.portCount!,
    referenceOhms: state.referenceOhms!.slice(),
    freqUnit: state.freqUnit,
    dataFormat: state.dataFormat,
    comments: comments.slice(),
    samples: [],
    matrixFormat: state.matrixFormat,
    version: state.version,
  });

  const buildMeta = (): FileMetadata => ({
    "Format": "Touchstone",
    "Version": state.versionString,
    "Port Count": String(state.portCount),
    "Parameter Type": state.parameterType,
    "Data Format": state.dataFormat,
    "Frequency Unit": state.freqUnit,
    "Reference": state.referenceOhms!.length === 1
      ? String(state.referenceOhms![0])
      : state.referenceOhms!.join(", "),
  });

  if (!dataTokens.length) {
    return { format: "touchstone", meta: buildMeta(), touchstoneNetwork: buildNetwork(), traces: [] };
  }

  const freqScaleMap: Record<string, number> = { Hz: 1, kHz: 1e3, MHz: 1e6, GHz: 1e9 };
  const samples: TouchstoneSample[] = [];
  let idx = 0;

  while (idx < dataTokens.length) {
    if (idx + expectedPerSample > dataTokens.length) {
      throw new Error(`Incomplete Touchstone network data at frequency sample ${samples.length + 1}.`);
    }
    const freqValue = dataTokens[idx]!;
    idx++;
    const freqScale = freqScaleMap[state.freqUnit] ?? 1e9;
    const freqHz = freqValue * freqScale;
    const values: Complex[] = [];
    for (let j = 0; j < order.length; j++) {
      const first = dataTokens[idx]!;
      idx++;
      const second = dataTokens[idx]!;
      idx++;
      values.push(touchstonePairToComplex(state.dataFormat, first, second));
    }
    const matrix = expandOrderedValuesToMatrix(state.portCount!, state.matrixFormat, values);
    if (!matrix) throw new Error("Unable to reconstruct the Touchstone network matrix.");
    samples.push({ freq: freqHz, sMatrix: matrix });
  }

  if (state.expectedFrequencyCount != null && state.expectedFrequencyCount !== samples.length) {
    throw new Error("Touchstone [Number of Frequencies] does not match the parsed sample count.");
  }

  const network: TouchstoneNetwork = { ...buildNetwork(), samples };

  return { format: "touchstone", meta: buildMeta(), touchstoneNetwork: network, traces: [] };
}
