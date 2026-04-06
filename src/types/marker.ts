// ============================================================================
// Mergen Scope — Marker Type Definitions
// ============================================================================
// Ported from: app-modules/marker-helpers.js shapes
// ============================================================================

/** IP3 marker role keys. */
export type IP3RoleKey = "f1" | "f2" | "im3l" | "im3u";

/** IP3 marker role labels. */
export type IP3RoleLabel = "F1" | "F2" | "IM3L" | "IM3U";

/** Marker type classification. */
export type MarkerType = "peak" | "normal" | "delta";

// ---------------------------------------------------------------------------
// Marker
// ---------------------------------------------------------------------------

/** A marker placed on a trace at a specific frequency/amplitude. */
export interface Marker {
  /** Frequency in Hz where the marker is placed. */
  readonly freq: number;

  /** Amplitude value at the marker position. */
  readonly amp: number;

  /** Name of the trace this marker belongs to. */
  readonly trace: string;

  /** Marker type. */
  readonly type: MarkerType;

  /** Optional label for special markers (e.g. IP3 role labels). */
  readonly label: string | null;

  /**
   * Index of the reference marker for delta measurements.
   * `null` when this marker is not in delta mode.
   */
  readonly refIdx: number | null;

  /**
   * Whether this marker's position was interpolated between
   * two data points rather than snapped to an existing sample.
   * NEW: Added for the interpolation marker feature.
   */
  readonly interpolated: boolean;
}

// ---------------------------------------------------------------------------
// Marker placement result (returned by placeMarker)
// ---------------------------------------------------------------------------

/** Result of placing a marker on trace data. */
export interface MarkerPlacement {
  /** Frequency of the placed marker (may differ from target if snapped). */
  readonly freq: number;

  /** Amplitude at the marker position. */
  readonly amp: number;

  /** Whether the position was interpolated. */
  readonly interpolated: boolean;
}

// ---------------------------------------------------------------------------
// IP3 points (from markers)
// ---------------------------------------------------------------------------

/** IP3 marker point for a single role. */
export interface IP3Point {
  readonly freq: number;
  readonly amp: number;
  readonly trace: string;
  readonly label: string;
}

/** Collection of IP3 marker points by role. */
export interface IP3Points {
  readonly f1: IP3Point | null;
  readonly f2: IP3Point | null;
  readonly im3l: IP3Point | null;
  readonly im3u: IP3Point | null;
}

// ---------------------------------------------------------------------------
// Extremum kind
// ---------------------------------------------------------------------------

/** Whether to search for a maximum or minimum. */
export type ExtremumKind = "max" | "min";

// ---------------------------------------------------------------------------
// Zoom window (used by marker/trace helpers)
// ---------------------------------------------------------------------------

/** A horizontal zoom range in Hz. */
export interface ZoomWindow {
  readonly left: number;
  readonly right: number;
}
