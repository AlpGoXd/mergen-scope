// ============================================================================
// Mergen Scope — File / Parser Type Definitions
// ============================================================================
// Ported from: app-modules/parser-helpers.js + file-store-helpers.js shapes
// ============================================================================

import type { Trace, TraceDomain } from "./trace.ts";
import type { TouchstoneNetwork } from "./touchstone.ts";

// ---------------------------------------------------------------------------
// File classification
// ---------------------------------------------------------------------------

/** Domain classification of a file. */
export type FileDomain = "frequency" | "time" | "network" | "unknown";

/** Detected file format. */
export type FileFormat =
  | "touchstone"
  | "rs-dat"
  | "tabular"
  | "binary"
  | "needs-import-wizard"
  | "unknown";

/** Result of classifying a file before parsing. */
export interface FileClassification {
  /** Detected signal domain. */
  readonly domain: FileDomain;

  /** Detected file format. */
  readonly format: FileFormat;

  /** Confidence of the classification (0–1). */
  readonly confidence: number;
}

// ---------------------------------------------------------------------------
// Metadata value
// ---------------------------------------------------------------------------

/** A numeric metadata value with optional unit. */
export interface MetadataValue {
  readonly value: number;
  readonly unit: string;
}

/** Metadata entries: either a numeric value with unit, or a plain string. */
export type MetadataEntry = MetadataValue | string;

/** File metadata dictionary. */
export type FileMetadata = Record<string, MetadataEntry>;

// ---------------------------------------------------------------------------
// Parsed file (output of a parser)
// ---------------------------------------------------------------------------

/** Result of parsing a measurement file. */
export interface ParsedFile {
  /** Detected format string. */
  readonly format: string;

  /** Extracted metadata key-value pairs. */
  readonly meta: FileMetadata;

  /** Parsed traces. */
  readonly traces: readonly Trace[];

  /** Touchstone network data (only for Touchstone files). */
  readonly touchstoneNetwork?: TouchstoneNetwork;

  /** Raw text (retained for tabular files needing the import wizard). */
  readonly rawText?: string;

  /** Suggested wizard configuration (for ambiguous tabular files). */
  readonly suggestedConfig?: WizardConfig;

  /** Preview lines for the import wizard. */
  readonly previewLines?: readonly string[];

  /** Original text (for import wizard re-parse). */
  readonly text?: string;

  /** Original file name (for import wizard re-parse). */
  readonly fileName?: string;
}

// ---------------------------------------------------------------------------
// Raw file record (stored in state)
// ---------------------------------------------------------------------------

/** A file record with a unique ID, stored in application state. */
export interface RawFileRecord {
  /** Unique file ID. */
  readonly id: string | number;

  /** Original file name. */
  readonly fileName: string;

  /** Extracted metadata. */
  readonly meta: FileMetadata;

  /** Parsed traces belonging to this file. */
  readonly traces: readonly Trace[];

  /** Detected format. */
  readonly format?: string;

  /** Touchstone network data (only for Touchstone files). */
  readonly touchstoneNetwork?: TouchstoneNetwork;
}

// ---------------------------------------------------------------------------
// Import wizard configuration
// ---------------------------------------------------------------------------

/** Configuration for the tabular import wizard. */
export interface WizardConfig {
  /** Column delimiter. */
  readonly delimiter: string;

  /** Number of header/skip rows before data starts. */
  readonly skipRows: number;

  /** Column index for X values. */
  readonly xCol: number;

  /** Column indices for Y values. */
  readonly yCols: readonly number[];

  /** X value multiplier (for unit conversion). */
  readonly xMult: number;

  /** Y value multiplier (for unit conversion). */
  readonly yMult: number;

  /** Detected signal domain. */
  readonly domain: TraceDomain;

  /** Classification confidence (0–1). */
  readonly confidence: number;

  /** Parsed headers. */
  readonly headers: readonly string[];
}
