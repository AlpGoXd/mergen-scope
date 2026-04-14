// ============================================================================
// Mergen Scope — Workspace Type Definitions
// ============================================================================
// Ported from: app-modules/workspace-helpers.js shapes
// ============================================================================

import type { Trace } from "./trace.ts";
import type { Marker } from "./marker.ts";
import type { Pane, YDomain } from "./pane.ts";
import type { RefLine } from "./ref-line.ts";
import type { AnalysisOpenState } from "./analysis.ts";
import type { ZoomWindow } from "./marker.ts";
import type { ComplexMatrix } from "./touchstone.ts";
import type { XUnit, YUnit } from "./units.ts";
import type { InterpolationStrategy } from "./interpolation.ts";

// ---------------------------------------------------------------------------
// Workspace file version
// ---------------------------------------------------------------------------

/** Current workspace serialization version. */
export const WORKSPACE_FILE_VERSION = 4 as const;

// ---------------------------------------------------------------------------
// Dataset / display trace model
// ---------------------------------------------------------------------------

export type WorkspaceDatasetFamily = "spectrum" | "network" | "waveform" | "iq" | "symbol";
export type WorkspaceDatasetKind = "source" | "derived";
export type WorkspaceDatasetBasis = "single-ended" | "mixed-mode";
export type WorkspaceDisplayTraceKind = "dataset-projection" | "derived-trace";
export type WorkspaceDisplayViewMode = "cartesian" | "smith" | "polar" | "eye" | "constellation";
export type WorkspaceDisplayTraceSourceRef =
  | {
      readonly sourceType: "series";
      readonly datasetFamily: Exclude<WorkspaceDatasetFamily, "network" | "iq" | "symbol">;
      readonly seriesId: string;
    }
  | {
      readonly sourceType: "network-parameter";
      readonly parameterFamily: "S" | "Z" | "Y" | "ABCD" | "H" | "G" | "T";
      readonly basis: WorkspaceDatasetBasis;
      readonly row: number;
      readonly col: number;
      readonly component: "complex" | "magnitude-db" | "magnitude-linear" | "phase" | "real" | "imag" | "vswr" | "return-loss" | "group-delay" | "stability-k" | "stability-mu1" | "stability-mu2" | "stability-muprime";
    }
  | {
      readonly sourceType: "iq";
      readonly component: "iq" | "constellation" | "eye";
    }
  | {
      readonly sourceType: "symbol";
      readonly component: "constellation" | "eye";
    };

export interface WorkspaceTransformStep {
  readonly id: string;
  readonly kind: "import" | "network-conversion" | "mixed-mode-conversion" | "renormalization" | "deembedding" | "resample" | "fft" | "trace-math" | "other";
  readonly label: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly inputDatasetIds: readonly string[];
  readonly inputDisplayTraceIds?: readonly string[];
}

export interface WorkspaceProvenance {
  readonly rootDatasetIds: readonly string[];
  readonly transformSteps: readonly WorkspaceTransformStep[];
}

export interface WorkspaceDatasetCapabilities {
  readonly supportsSmithView: boolean;
  readonly supportsPolarView: boolean;
  readonly supportsGroupDelay: boolean;
  readonly supportsStabilityAnalysis: boolean;
  readonly supportsEyeDiagram: boolean;
  readonly supportsConstellation: boolean;
  readonly supportsBERAnalysis: boolean;
  readonly supportsFftView: boolean;
}

export interface WorkspaceDatasetBase {
  readonly id: string;
  readonly family: WorkspaceDatasetFamily;
  readonly kind: WorkspaceDatasetKind;
  readonly label: string;
  readonly fileId?: string | number | null;
  readonly fileName?: string | null;
  readonly hidden?: boolean;
  readonly isUniform?: boolean;
  readonly provenance: WorkspaceProvenance;
  readonly capabilities: WorkspaceDatasetCapabilities;
}

export interface WorkspaceScalarSample {
  readonly x: number;
  readonly y: number;
}

export interface WorkspaceScalarSeries {
  readonly id: string;
  readonly label: string;
  readonly xUnit: XUnit | string | null;
  readonly yUnit: YUnit | string | null;
  readonly samples: readonly WorkspaceScalarSample[];
}

export interface WorkspaceNetworkSample {
  readonly freqHz: number;
  readonly matrix: ComplexMatrix;
}

export interface WorkspaceSpectrumDatasetRecord extends WorkspaceDatasetBase {
  readonly family: "spectrum";
  readonly xDomain: "frequency";
  readonly series: readonly WorkspaceScalarSeries[];
}

export interface WorkspaceWaveformDatasetRecord extends WorkspaceDatasetBase {
  readonly family: "waveform";
  readonly xDomain: "time";
  readonly series: readonly WorkspaceScalarSeries[];
}

export interface WorkspaceNetworkDatasetRecord extends WorkspaceDatasetBase {
  readonly family: "network";
  readonly xDomain: "frequency";
  readonly parameterFamily: "S" | "Z" | "Y" | "ABCD" | "H" | "G" | "T";
  readonly basis: WorkspaceDatasetBasis;
  readonly portCount: number;
  readonly referenceOhms: readonly number[];
  readonly samples: readonly WorkspaceNetworkSample[];
}

export interface WorkspaceIqDatasetRecord extends WorkspaceDatasetBase {
  readonly family: "iq";
}

export interface WorkspaceSymbolDatasetRecord extends WorkspaceDatasetBase {
  readonly family: "symbol";
}

export type WorkspaceDatasetRecord =
  | WorkspaceSpectrumDatasetRecord
  | WorkspaceWaveformDatasetRecord
  | WorkspaceNetworkDatasetRecord
  | WorkspaceIqDatasetRecord
  | WorkspaceSymbolDatasetRecord;

export interface WorkspaceDisplayTraceProvenance {
  readonly parentDatasetId: string;
  readonly parentDisplayTraceIds: readonly string[];
  readonly transformSteps: readonly string[];
}

export interface WorkspaceScalarDisplayPoint {
  readonly x: number;
  readonly y: number;
}

export interface WorkspaceComplexDisplayPoint {
  readonly x: number;
  readonly re: number;
  readonly im: number;
}

export interface WorkspaceDisplayTraceBase {
  readonly id: string;
  readonly kind: WorkspaceDisplayTraceKind;
  readonly label: string;
  readonly datasetId: string;
  readonly family: WorkspaceDatasetFamily;
  readonly hidden?: boolean;
  readonly isUniform?: boolean;
  readonly interpolation?: InterpolationStrategy;
  readonly provenance: WorkspaceDisplayTraceProvenance;
  readonly source: WorkspaceDisplayTraceSourceRef;
  readonly supportedViews: readonly WorkspaceDisplayViewMode[];
  readonly defaultView: WorkspaceDisplayViewMode;
  readonly compat?: {
    readonly legacyTraceName?: string;
    readonly legacyDisplayName?: string;
  };
}

export interface WorkspaceScalarDisplayTrace extends WorkspaceDisplayTraceBase {
  readonly valueType: "scalar";
  readonly xUnit: string | null;
  readonly yUnit: string | null;
  readonly semantics: "magnitude" | "phase" | "real" | "imag" | "group-delay" | "vswr" | "return-loss" | "stability" | "time-amplitude" | "power-density" | "custom";
  readonly points: readonly WorkspaceScalarDisplayPoint[];
}

export interface WorkspaceComplexDisplayTrace extends WorkspaceDisplayTraceBase {
  readonly valueType: "complex";
  readonly xUnit: string | null;
  readonly valueUnit: string | null;
  readonly semantics: "network-parameter" | "impedance" | "admittance" | "transfer" | "iq" | "custom";
  readonly points: readonly WorkspaceComplexDisplayPoint[];
}

export type WorkspaceDisplayTraceRecord = WorkspaceScalarDisplayTrace | WorkspaceComplexDisplayTrace;

export interface WorkspaceFileRecord {
  readonly id: string | number;
  readonly fileName: string;
  readonly meta: Readonly<Record<string, unknown>>;
  readonly traces: readonly Trace[];
  readonly datasets?: readonly WorkspaceDatasetRecord[];
  readonly displayTraces?: readonly WorkspaceDisplayTraceRecord[];
  readonly format?: string;
  readonly touchstoneNetwork?: import("./touchstone.ts").TouchstoneNetwork;
}

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
  readonly showDetailedFiles: boolean;
  readonly showRightPanel: boolean;
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
  readonly traceColors: Readonly<Record<string, string>>;
  readonly traceInterpolations: Readonly<Record<string, InterpolationStrategy>>;
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
  readonly files: readonly WorkspaceFileRecord[];
  readonly datasets: readonly WorkspaceDatasetRecord[];
  readonly displayTraces: readonly WorkspaceDisplayTraceRecord[];
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
