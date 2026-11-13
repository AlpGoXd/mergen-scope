// ============================================================================
// Mergen Scope — Pane Type Definitions
// ============================================================================
// Ported from: app-modules/pane-helpers.js shapes
// ============================================================================

// ---------------------------------------------------------------------------
// Pane render mode
// ---------------------------------------------------------------------------

/** How a chart pane renders its traces. */
export type PaneRenderMode = "cartesian" | "smith" | "smith-inverted" | "table";
export interface SmithSettings {
  readonly range?: { readonly startHz: number; readonly stopHz: number } | null;
  readonly outside?: 'hidden' | 'faint';
  readonly grid: 'z' | 'y' | 'both';
  readonly labels: 'normalised' | 'ohms' | 'off';
  readonly direction: 'chevrons' | 'ends' | 'off';
  readonly readout: readonly ('z' | 'y' | 'gamma' | 'vswr' | 'return-loss')[];
}

/** Table pane settings (table kit, P2). */
export interface TableSettings {
  /** 'all' (default) or 'visible': the linked pane's visible X range. */
  readonly range: 'all' | 'visible';
}

export function defaultTableSettings(): TableSettings {
  return { range: 'all' };
}

// ---------------------------------------------------------------------------
// Pane settings
// ---------------------------------------------------------------------------

/** Per-pane display and grid settings. */
export interface PaneSettings {
  smith: SmithSettings;
  /** Only read by Table panes; missing means the defaults. */
  table?: TableSettings;
  // Grid
  gridMajor: boolean;
  gridMinor: boolean;          // state preserved; minor grid not supported by Recharts
  gridMajorThickness: number;  // px, clamped [0.5, 5]
  gridMinorThickness: number;  // px, clamped [0.5, 5]
  gridMajorOpacity: number;    // [0, 1]
  gridMinorOpacity: number;    // [0, 1]
  gridDashStyle: string;       // strokeDasharray value, e.g. "3 3" or "solid"

  // Display toggles
  showSampleDots: boolean;
  showMarkers: boolean;
  showReferenceLines: boolean;
  showLineLabels: boolean;
  showMarkerLabels: boolean;
}

export function defaultPaneSettings(): PaneSettings {
  return {
    smith: { grid: 'z', labels: 'normalised', direction: 'chevrons', readout: ['z', 'gamma', 'vswr'], range: null, outside: 'hidden' },
    gridMajor: true,
    gridMinor: false,
    gridMajorThickness: 1,
    gridMinorThickness: 0.5,
    gridMajorOpacity: 0.25,
    gridMinorOpacity: 0.15,
    gridDashStyle: '3 3',
    showSampleDots: false,
    showMarkers: true,
    showReferenceLines: true,
    showLineLabels: true,
    showMarkerLabels: true,
  };
}

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
  readonly typed: boolean;

  /** Per-pane display and grid settings. */
  readonly settings: PaneSettings;

  /** Optional persisted X-axis group, used by linked lines. */
  readonly xLinkGroup?: string | null;
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
