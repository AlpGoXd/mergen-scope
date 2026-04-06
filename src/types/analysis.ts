// ============================================================================
// Mergen Scope — Analysis Type Definitions
// ============================================================================
// Ported from: app-modules/analysis-target-helpers.js shapes
// ============================================================================

import type { DataPoint, Trace } from "./trace.ts";
import type { ZoomWindow } from "./marker.ts";
import type { TouchstoneNetwork, NetworkSource } from "./touchstone.ts";

// ---------------------------------------------------------------------------
// Analysis scope — where an analysis item is visible
// ---------------------------------------------------------------------------

/**
 * Scope determines which trace contexts show the analysis item.
 * Renamed: "touchstone" → "network" as per prompt instructions.
 */
export type AnalysisScope = "spectrum" | "network" | "shared";

/** Analysis item group for UI organization. */
export type AnalysisGroup = "measure" | "touchstone";

// ---------------------------------------------------------------------------
// Analysis item (registry entry)
// ---------------------------------------------------------------------------

/** A single analysis tool definition. */
export interface AnalysisItem {
  /** Unique analysis item identifier. */
  readonly id: string;

  /** Display title. */
  readonly title: string;

  /** CSS color variable name for theming. */
  readonly colorVar: string;

  /** Item kind — always "analysis" for now. */
  readonly kind: "analysis";

  /** UI group for organization. */
  readonly group: AnalysisGroup;

  /** Visibility scope. */
  readonly scope: AnalysisScope;
}

// ---------------------------------------------------------------------------
// Analysis registry entry (augmented for UI)
// ---------------------------------------------------------------------------

/** An analysis item enriched with current state. */
export interface AnalysisRegistryEntry {
  readonly id: string;
  readonly title: string;
  readonly kind: "analysis";
  readonly group: AnalysisGroup;
  readonly scope: AnalysisScope;
  readonly colorVar: string;
  readonly isOpen: boolean;
  readonly resultCount: number;
}

// ---------------------------------------------------------------------------
// Touchstone context (resolved per-trace)
// ---------------------------------------------------------------------------

/** Touchstone-specific context resolved for an analysis target trace. */
export interface TouchstoneContext {
  readonly isTouchstone: true;
  readonly fileId: string | number | null;
  readonly fileName: string | null;
  readonly parameterType: string;
  readonly portCount: number | null;
  readonly family: string;
  readonly view: string;
  readonly row: number | null;
  readonly col: number | null;
  readonly metric: string | null;
  readonly referenceOhms: number | readonly number[] | null;
  readonly freqUnit: string;
  readonly dataFormat: string | null;
  readonly comments: readonly string[];
  readonly samples: readonly unknown[] | null;
  readonly network: TouchstoneNetwork | null;
  readonly source: NetworkSource | null;
  readonly traceLabel: string;
}

/** Touchstone trace kind classification. */
export type TouchstoneTraceKind =
  | "reflection"
  | "transmission"
  | "scalar-metric"
  | "touchstone";

// ---------------------------------------------------------------------------
// Analysis target (resolved for the active pane)
// ---------------------------------------------------------------------------

/** The fully-resolved analysis target with trace, data, and context. */
export interface AnalysisTarget {
  /** Active pane ID. */
  readonly paneId: string;

  /** The resolved target trace, or null if none available. */
  readonly trace: Trace | null;

  /** Display label for the target trace. */
  readonly traceLabel: string;

  /** Visible data points (filtered by zoom). */
  readonly data: readonly DataPoint[];

  /** Frequency range of the visible data. */
  readonly rangeHz: ZoomWindow | null;

  /** X-axis unit. */
  readonly xUnit: string;

  /** Y-axis unit. */
  readonly yUnit: string;

  /** Whether the target is usable for analysis. */
  readonly supported: boolean;

  /** Touchstone context, or null for non-Touchstone traces. */
  readonly touchstone: TouchstoneContext | null;

  /** Whether the trace has Touchstone data. */
  readonly touchstoneSupported: boolean;

  /** Reason for Touchstone unsupported state. */
  readonly touchstoneReason: string;

  /** Reason the overall target is unsupported. */
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Analysis open state
// ---------------------------------------------------------------------------

/** Map of analysis item IDs to their open/closed state. */
export type AnalysisOpenState = Record<string, boolean>;
