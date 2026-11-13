// ============================================================================
// Mergen Scope — Measurement File Parser (dispatcher)
// ============================================================================
// Ported from: app-modules/parser-helpers.js (parseMeasurementFile)
// ============================================================================

import type { ParsedFile, FileClassification } from "../../types/file.ts";
import { classify } from "./classifier.ts";
import { parseRSDat } from "./rs-dat.ts";
import { parseTouchstoneFile } from "./touchstone.ts";
import { parseTabularFile } from "./tabular.ts";
import { contentLines, detectTabular } from "./tabular-detect.ts";

// ---------------------------------------------------------------------------
// Format detection helpers
// ---------------------------------------------------------------------------

function isTouchstoneFileName(fileName: string): boolean {
  return /\.(s\d+p)$/i.test(String(fileName ?? ""));
}

function getFirstNonCommentLine(text: string): string {
  const lines = String(text ?? "").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.replace(/^\uFEFF/, "").trim();
    if (!line) continue;
    if (line.charAt(0) === "!") continue;
    return line;
  }
  return "";
}

function looksLikeTouchstoneText(text: string): boolean {
  const first = getFirstNonCommentLine(text);
  if (!first) return false;
  if (/^\[Version\]/i.test(first)) return true;
  if (/^\[(Number of Ports|Reference|Network Data|Matrix Format|End)\]/i.test(first)) return true;
  if (/^#/.test(first)) return isTouchstoneOptionLine(first);
  return false;
}

// A bare "#" is a valid default option line; other "#..." lines (instrument comments) are not Touchstone.
const TOUCHSTONE_OPTION_TOKEN = /^(hz|khz|mhz|ghz|s|y|z|h|g|db|ma|ri|r|[+-]?\d+(\.\d*)?(e[+-]?\d+)?)$/i;
function isTouchstoneOptionLine(line: string): boolean {
  const tokens = line.slice(1).replace(/!.*$/, "").trim().split(/\s+/).filter(Boolean);
  return tokens.every((token) => TOUCHSTONE_OPTION_TOKEN.test(token));
}

function detectImportedFileFormat(text: string, fileName: string): string {
  if (isTouchstoneFileName(fileName)) return "touchstone";
  if (looksLikeTouchstoneText(text)) return "touchstone";
  return "rs-dat";
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/** Parse a measurement file, dispatching to the appropriate parser. */
export function parseMeasurementFile(
  text: string,
  fileName: string,
  fileProfile?: FileClassification | null,
): ParsedFile {
  const profile = fileProfile ?? classify(text, fileName);
  const isDatFile = /\.dat$/i.test(String(fileName ?? ""));

  // Prefer the dedicated R&S DAT parser for .dat files to avoid
  // misclassification into multi-column tabular imports.
  if (profile.format === "tabular" && !isDatFile) {
    return parseTabularFile(text, fileName, null);
  }

  const detectedFormat = detectImportedFileFormat(text, fileName);
  if (detectedFormat === "touchstone") {
    return parseTouchstoneFile(text, fileName);
  }

  return parseRSDat(text, fileName);
}

// ---------------------------------------------------------------------------
// Opening files from the UI: the content decides, never the extension
// ---------------------------------------------------------------------------

const RS_DAT_KEYS = /^(type|version|date|mode|center freq|start|stop|span|ref level|rbw|vbw|swt|x-axis|y-axis|x-unit|y-unit|trace|trace mode|detector|values)$/i;

/** An R&S instrument export: "R&S" on the first line, or a "Key;Value;" header with x-Unit or Values. */
export function looksLikeRsDatText(text: string): boolean {
  const lines = contentLines(text).slice(0, 60);
  if (lines[0]?.includes("R&S")) return true;
  let keys = 0;
  let anchor = false;
  for (const line of lines) {
    const key = line.split(";")[0]?.trim() ?? "";
    if (!line.includes(";") || !RS_DAT_KEYS.test(key)) continue;
    keys += 1;
    if (/^(x-unit|values)$/i.test(key)) anchor = true;
  }
  return anchor && keys >= 3;
}

/** A recognised file signature, or null when the file needs the import wizard. */
export function detectFileSignature(text: string): "rs-dat" | "touchstone" | null {
  if (looksLikeTouchstoneText(text)) return "touchstone";
  if (looksLikeRsDatText(text)) return "rs-dat";
  return null;
}

/** Parse a file opened by the user: signatures import directly, everything else goes to the wizard. */
export function parseForImport(text: string, fileName: string): ParsedFile {
  const signature = detectFileSignature(text);
  if (signature === "touchstone") return parseTouchstoneFile(text, fileName);
  if (signature === "rs-dat") return parseRSDat(text, fileName);
  return {
    format: "needs-import-wizard",
    text,
    fileName,
    suggestedConfig: detectTabular(text).config,
    previewLines: contentLines(text).slice(0, 100),
    meta: {},
    traces: [],
  };
}
