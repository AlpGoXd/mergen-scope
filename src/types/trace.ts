// ============================================================================
// Mergen Scope — Trace Type Definitions
// ============================================================================
// Ported from: app-modules/trace-model.js
// Preserves the universal { freq, amp } data point shape.
// ============================================================================

import type { YUnit, XUnit } from "./units.ts";
import type { TouchstoneNetwork, NetworkSource } from "./touchstone.ts";
import type { DatasetFamily } from "./dataset.ts";
import type { InterpolationStrategy } from "./interpolation.ts";

// ---------------------------------------------------------------------------
// Data point — the universal shape
// ---------------------------------------------------------------------------

/** A single measurement data point. Every trace stores an array of these. */
export interface DataPoint {
  readonly freq: number;
  readonly amp: number;
}

// ---------------------------------------------------------------------------
// Trace domain
// ---------------------------------------------------------------------------

/** The X-axis domain of a trace. */
export type TraceDomain = "frequency" | "time";

// ---------------------------------------------------------------------------
// Trace kind
// ---------------------------------------------------------------------------

/** Whether a trace is raw (imported from a file) or derived (computed). */
export type TraceKind = "raw" | "derived";

// ---------------------------------------------------------------------------
// Operation type for derived traces
// ---------------------------------------------------------------------------

/**
 * The mathematical or analytical operation that produced a derived trace.
 * Used by trace-ops and analysis functions.
 */
export type OperationType =
  | "add"
  | "subtract"
  | "multiply"
  | "divide"
  | "offset"
  | "scale"
  | "smooth"
  | "noise-psd"
  | "derived";

// ---------------------------------------------------------------------------
// Trace unit metadata
// ---------------------------------------------------------------------------

/** X/Y unit pair carried by every trace. */
export interface TraceUnits {
  readonly x: XUnit | string | null;
  readonly y: YUnit | string | null;
}

// ---------------------------------------------------------------------------
// Base trace shape (shared by raw and derived)
// ---------------------------------------------------------------------------

/** Fields common to both raw and derived traces. */
export interface TraceBase {
  /** Unique trace identifier, e.g. "trace-7". */
  readonly id: string;

  /** Discriminator: "raw" or "derived". */
  readonly kind: TraceKind;

  /** IDs of the traces this trace depends on. Raw traces reference themselves. */
  readonly sourceTraceIds: readonly string[];

  /** The operation that produced this trace, or `null` for raw traces. */
  readonly operationType: OperationType | null;

  /** Operation parameters (window size, poly order, etc.). */
  readonly parameters: Record<string, unknown> | null;

  /** X/Y unit metadata. */
  readonly units: TraceUnits;

  /** The pane this trace is assigned to, or `null` for default. */
  readonly paneId: string | null;

  /**
   * Unique persistent name used as key in maps (visibility, pane assignment).
   * Format: `"<prefix><traceLabel>_<fileCounter>"` for raw traces.
   */
  readonly name: string;

  /** Trace acquisition mode (e.g. "Write", "MaxHold"). */
  readonly mode: string;

  /** Detector type (e.g. "RMS", "Peak"). */
  readonly detector: string;

  /** Canonical dataset family from the File -> Dataset -> DisplayTrace pipeline. */
  readonly family: DatasetFamily;

  /** X-axis domain: frequency or time. */
  readonly domain: TraceDomain;

  /** The measurement data. Sorted ascending by `freq`. */
  readonly data: readonly DataPoint[];

  /** Source file name. */
  readonly file: string | null;

  /** Display name shown in the UI. */
  readonly dn: string;

  /** True when the source x-samples are uniformly spaced within tolerance. */
  readonly isUniform?: boolean;

  /** Optional per-trace interpolation override. */
  readonly interpolation?: InterpolationStrategy;
}

// ---------------------------------------------------------------------------
// Raw trace (imported from a file)
// ---------------------------------------------------------------------------

/** A raw trace created by a parser when importing measurement files. */
export interface RawTrace extends TraceBase {
  readonly kind: "raw";
  readonly operationType: null;

  /** Optional touchstone network data attached to the file. */
  readonly touchstoneNetwork?: TouchstoneNetwork;

  /** Optional S-parameter cell source metadata. */
  readonly networkSource?: NetworkSource;

  /** File ID for workspace tracking. */
  readonly fileId?: string | number | null;

  /** File name duplicate of `file` for serialization compat. */
  readonly fileName?: string | null;
}

// ---------------------------------------------------------------------------
// Derived trace (computed from one or more source traces)
// ---------------------------------------------------------------------------

/** A trace produced by a trace math operation (subtract, smooth, etc.). */
export interface DerivedTrace extends TraceBase {
  readonly kind: "derived";
  readonly operationType: OperationType;
}

// ---------------------------------------------------------------------------
// Union type
// ---------------------------------------------------------------------------

/** Any trace — either raw or derived. */
export type Trace = RawTrace | DerivedTrace;
