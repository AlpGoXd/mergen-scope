// ============================================================================
// Mergen Scope — Pane Type Definitions
// ============================================================================
// Ported from: app-modules/pane-helpers.js shapes
// ============================================================================

// ---------------------------------------------------------------------------
// Pane render mode
// ---------------------------------------------------------------------------

/** How a chart pane renders its traces. */
export type PaneRenderMode = "cartesian" | "smith" | "smith-inverted";

// ---------------------------------------------------------------------------
// Pane
// ---------------------------------------------------------------------------

/** A chart pane in the multi-pane layout. */
export interface Pane {
  /** Unique pane identifier, e.g. "pane-1". */
  readonly id: string;

  /** User-facing pane title. */
  readonly title: string;

  /** Rendering mode for this pane. */
  readonly renderMode: PaneRenderMode;
}

// ---------------------------------------------------------------------------
// Pane assignment result (returned by canAssignTraceToPane)
// ---------------------------------------------------------------------------

/** Result of checking whether a trace can be assigned to a pane. */
export interface PaneAssignmentResult {
  /** Whether the assignment is allowed. */
  readonly allowed: boolean;

  /** Reason for rejection, if `allowed` is false. */
  readonly reason?: string;
}

// ---------------------------------------------------------------------------
// Y-axis domain
// ---------------------------------------------------------------------------

/** A Y-axis range for auto/manual scaling. */
export interface YDomain {
  readonly min: number;
  readonly max: number;
}
