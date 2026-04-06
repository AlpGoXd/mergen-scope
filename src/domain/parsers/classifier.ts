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
// File classification
// ---------------------------------------------------------------------------

/** Classify a file based on its text content and file name. */
export function classify(fileText: string, fileName: string): FileClassification {
  const ext = String(fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
  const isTouchstone = /^s\d+p$/.test(ext);

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

  const isTabular = ext === "csv" || ext === "txt" || ext === "dat";

  return {
    domain: likelyDomain,
    format: isTabular ? "tabular" : "unknown",
    confidence: conf,
  };
}
