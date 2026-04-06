// ============================================================================
// Mergen Scope — Workspace Type Definitions
// ============================================================================
// Ported from: app-modules/workspace-helpers.js shapes
// ============================================================================

import type { Trace } from "./trace.ts";
import type { Marker } from "./marker.ts";
import type { Pane, YDomain } from "./pane.ts";
import type { RefLine } from "./ref-line.ts";
import type { RawFileRecord } from "./file.ts";
import type { AnalysisOpenState } from "./analysis.ts";
import type { ZoomWindow } from "./marker.ts";

// ---------------------------------------------------------------------------
// Workspace file version
// ---------------------------------------------------------------------------

/** Current workspace serialization version. */
export const WORKSPACE_FILE_VERSION = 3 as const;

// ---------------------------------------------------------------------------
// X-axis zoom state
// ---------------------------------------------------------------------------

/** X-axis zoom state across panes. */
export interface XZoomState {
  /** Whether all panes share the same X zoom. */
  readonly zoomAll: boolean;

  /** Shared zoom window (when zoomAll is true). */
  readonly sharedZoom: ZoomWindow | null;

  /** Per-pane X zoom windows. */
  readonly paneXZooms: Readonly<Record<string, ZoomWindow>>;
}

// ---------------------------------------------------------------------------
// Y-axis zoom state
// ---------------------------------------------------------------------------

/** Y-axis zoom state across panes. */
export interface YZoomState {
  /** Per-pane Y-axis domains. */
  readonly paneYZooms: Readonly<Record<string, YDomain>>;
}

// ---------------------------------------------------------------------------
// UI state
// ---------------------------------------------------------------------------

/** Serializable UI state for workspace snapshots. */
export interface WorkspaceUiState {
  readonly showSidebar: boolean;
  readonly showMeta: boolean;
  readonly showMarkers: boolean;
  readonly showMarkerTools: boolean;
  readonly showPaneTools: boolean;
  readonly showSearchTools: boolean;
  readonly showLineTools: boolean;
  readonly showViewTools: boolean;
  readonly showDots: boolean;
  readonly showDT: boolean;
  readonly theme: "dark" | "light" | "glass";
  readonly lockLinesAcrossPanes: boolean;
  readonly searchDirection: "left" | "right";
  readonly newMarkerArmed: boolean;
  readonly markerTrace: string;
  readonly selectedMkrIdx: number | null;
  readonly dRef: number | null;
  readonly refMode: "h" | "v" | null;
  readonly selectedRefLineId: number | null;
  readonly showTouchstoneControls: boolean;
  readonly showTraceOps: boolean;
  readonly showImportExportPanel: boolean;
  readonly traceOpsOpenSections: TraceOpsOpenSections;
  readonly showAnalysisPanel: boolean;
  readonly noiseFilter: string;
  readonly noiseSource: string | null;
  readonly ip3Gain: string;
  readonly dtTrace: string | null;
}

/** Trace operations panel section open state. */
export interface TraceOpsOpenSections {
  readonly offset: boolean;
  readonly scale: boolean;
  readonly smoothing: boolean;
  readonly subtract: boolean;
}

// ---------------------------------------------------------------------------
// Saved analysis result
// ---------------------------------------------------------------------------

/** A saved noise or IP3 analysis result. */
export interface SavedAnalysisResult {
  readonly id: number;
  readonly functionType: string;
  readonly traceLabel: string;
  readonly sourceTraceId: string | null;
  readonly sourceTraceName: string | null;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly values: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Workspace snapshot
// ---------------------------------------------------------------------------

/** A complete, normalized workspace snapshot suitable for serialization. */
export interface WorkspaceSnapshot {
  readonly version: number;
  readonly files: readonly RawFileRecord[];
  readonly derivedTraces: readonly Trace[];
  readonly vis: Readonly<Record<string, boolean>>;
  readonly paneMode: number;
  readonly panes: readonly Pane[];
  readonly paneRenderModes: Readonly<Record<string, string>>;
  readonly activePaneId: string;
  readonly traceAssignments: Readonly<Record<string, string>>;
  readonly paneActiveTraceMap: Readonly<Record<string, string | null>>;
  readonly xZoomState: XZoomState;
  readonly yZoomState: YZoomState;
  readonly ui: WorkspaceUiState;
  readonly markers: readonly Marker[];
  readonly refLines: readonly RefLine[];
  readonly savedNoise: readonly SavedAnalysisResult[];
  readonly savedIP3: readonly SavedAnalysisResult[];
  readonly analysisOpenState: AnalysisOpenState;
  readonly selectedTraceName: string | null;
}

// ---------------------------------------------------------------------------
// Workspace export package
// ---------------------------------------------------------------------------

/** Export summary metadata. */
export interface WorkspaceExportSummary {
  readonly fileCount: number;
  readonly rawTraceCount: number;
  readonly derivedTraceCount: number;
}

/** A full workspace export package with metadata envelope. */
export interface WorkspaceExportPackage {
  readonly kind: "mergen-scope-workspace";
  readonly version: number;
  readonly app: string;
  readonly exportedAt: string;
  readonly summary: WorkspaceExportSummary;
  readonly snapshot: WorkspaceSnapshot;
}
