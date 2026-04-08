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
  if (/^#/i.test(first)) return true;
  return false;
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
