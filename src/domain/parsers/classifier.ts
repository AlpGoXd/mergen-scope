// ============================================================================
// Mergen Scope — File Classifier
// ============================================================================
// Ported from: app-modules/file-classifier.js (83 lines)
// ============================================================================

import type { FileClassification, FileDomain, FileFormat } from "../../types/file.ts";

// ---------------------------------------------------------------------------
// Column domain guessing
// ---------------------------------------------------------------------------

/** Guess the domain (frequency/time) from a column header name. */
export function guessColumnDomain(headerName: string): "frequency" | "time" | null {
  const h = String(headerName ?? "").toLowerCase().trim();
  if (h.indexOf("freq") !== -1 || h.indexOf("hz") !== -1 || h.indexOf("mhz") !== -1) return "frequency";
  if (h.indexOf("time") !== -1 || h.indexOf("s") === 0 || h.indexOf("ms") === 0 || h.indexOf("ns") === 0 || h === "t") return "time";
  return null;
}

// ---------------------------------------------------------------------------
// Touchstone content detection
// ---------------------------------------------------------------------------

// A bare "#" is a valid default option line; other "#..." lines (instrument comments) are not Touchstone.
export const TOUCHSTONE_OPTION_TOKEN =
  /^(?:hz|khz|mhz|ghz|s|y|z|h|g|db|ma|ri|r|[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?)$/i;

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

function isTouchstoneOptionLine(line: string): boolean {
  if (/^#!/.test(line)) return false;
  const tokens = line.slice(1).replace(/!.*$/, "").trim().split(/\s+/).filter(Boolean);
  return tokens.every((token) => TOUCHSTONE_OPTION_TOKEN.test(token));
}

/** True when the first non-comment line matches Touchstone v1/v2 syntax. */
export function looksLikeTouchstoneText(text: string): boolean {
  const first = getFirstNonCommentLine(text);
  if (!first) return false;
  if (/^\[Version\]/i.test(first)) return true;
  if (
    /^\[(Number of Ports|Two-Port Data Order|Number of Frequencies|Number of Noise Frequencies|Reference|Matrix Format|Mixed-Mode Order|Begin Information|Network Data|Noise Data|End)\]/i.test(
      first,
    )
  ) {
    return true;
  }
  if (/^#/.test(first)) return isTouchstoneOptionLine(first);
  return false;
}

// ---------------------------------------------------------------------------
// File classification
// ---------------------------------------------------------------------------

/** Classify a file based on its text content and file name. */
export function classify(fileText: string, fileName: string): FileClassification {
  const ext = String(fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
  // Only route .ts files to Touchstone when content looks like Touchstone (not TypeScript source).
  const isTouchstone = /^s\d+p$/.test(ext) || (ext === "ts" && looksLikeTouchstoneText(fileText));

  if (isTouchstone) {
    return { domain: "network" as FileDomain, format: "touchstone" as FileFormat, confidence: 1.0 };
  }

  // Rough binary check
  if (String(fileText ?? "").indexOf("\0") !== -1) {
    return { domain: "unknown" as FileDomain, format: "binary" as FileFormat, confidence: 1.0 };
  }

  const lines = String(fileText ?? "").split(/\r?\n/).slice(0, 100);

  // Default heuristics
  let likelyDomain: FileDomain = "frequency";
  let conf = 0.5;

  // Fast R&S DAT detector
  if (lines.length > 0 && lines[0]!.indexOf("R&S") !== -1) {
    return { domain: "frequency", format: "rs-dat", confidence: 0.95 };
  }

  // Attempt to guess via headers
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const line = lines[i]!;
    const parts = line.split(/[;,\t]/);
    if (parts.length >= 2) {
      const col0Domain = guessColumnDomain(parts[0]!);
      if (col0Domain) {
        likelyDomain = col0Domain;
        conf = 0.8;
        break;
      }
    }
  }

  const isTabular = ext === "csv" || ext === "tsv" || ext === "txt" || ext === "dat";

  return {
    domain: likelyDomain,
    format: isTabular ? "tabular" : "unknown",
    confidence: conf,
  };
}

