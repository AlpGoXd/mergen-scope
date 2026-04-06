// ============================================================================
// Mergen Scope — Workspace Serialization
// ============================================================================
// Ported from: app-modules/workspace-helpers.js
// ============================================================================

import type {
  WorkspaceSnapshot,
  WorkspaceExportPackage,
  XZoomState,
  YZoomState,
  WorkspaceUiState,
} from "../types/workspace.ts";
import type { Trace } from "../types/trace.ts";
import type { Marker } from "../types/marker.ts";
import type { Pane } from "../types/pane.ts";
import type { RefLine } from "../types/ref-line.ts";
import type { RawFileRecord } from "../types/file.ts";
import { normalizePanes, normalizeTracePaneMap, normalizePaneActiveTraceMap } from "./pane-math.ts";
import { normalizeAnalysisOpenState } from "./analysis/registry.ts";

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

const CURRENT_VERSION = 3;

// ---------------------------------------------------------------------------
// Default UI state
// ---------------------------------------------------------------------------

function defaultUiState(): WorkspaceUiState {
  return {
    showSidebar: true,
    showMeta: false,
    showMarkers: false,
    showMarkerTools: false,
    showPaneTools: false,
    showSearchTools: false,
    showLineTools: false,
    showViewTools: false,
    showDots: false,
    showDT: false,
    theme: "dark",
    lockLinesAcrossPanes: false,
    searchDirection: "left",
    newMarkerArmed: false,
    markerTrace: "",
    selectedMkrIdx: null,
    dRef: null,
    refMode: null,
    selectedRefLineId: null,
    showTouchstoneControls: false,
    showTraceOps: false,
    showImportExportPanel: false,
    traceOpsOpenSections: { offset: false, scale: false, smoothing: false, subtract: false },
    showAnalysisPanel: false,
    noiseFilter: "gaussian",
    noiseSource: null,
    ip3Gain: "",
    dtTrace: null,
  };
}

// ---------------------------------------------------------------------------
// Default zoom state
// ---------------------------------------------------------------------------

function defaultXZoomState(): XZoomState {
  return { zoomAll: false, sharedZoom: null, paneXZooms: {} };
}

function defaultYZoomState(): YZoomState {
  return { paneYZooms: {} };
}

// ---------------------------------------------------------------------------
// Normalize snapshot
// ---------------------------------------------------------------------------

/** Normalize a raw snapshot to fill defaults and clamp invalid values. */
export function normalizeSnapshot(raw: Partial<WorkspaceSnapshot> | null): WorkspaceSnapshot {
  const version = raw?.version ?? CURRENT_VERSION;
  const files = Array.isArray(raw?.files) ? raw.files : [];
  const derivedTraces = Array.isArray(raw?.derivedTraces) ? raw.derivedTraces : [];
  const vis: Record<string, boolean> = raw?.vis ? { ...raw.vis } : {};
  const paneMode = Math.max(1, Math.min(4, raw?.paneMode ?? 1));
  const panes = normalizePanes(raw?.panes, paneMode);
  const paneRenderModes: Record<string, string> = raw?.paneRenderModes ? { ...raw.paneRenderModes } : {};
  const activePaneId = raw?.activePaneId || "pane-1";

  // Build allTr for pane normalization
  const allTr: Trace[] = [];
  for (const file of files) {
    if (Array.isArray(file.traces)) allTr.push(...file.traces);
  }
  allTr.push(...derivedTraces);

  const traceAssignments = normalizeTracePaneMap(allTr, raw?.traceAssignments ?? null, panes);
  const paneActiveTraceMap = normalizePaneActiveTraceMap(allTr, traceAssignments, panes, raw?.paneActiveTraceMap ?? null);

  const xZoomState: XZoomState = raw?.xZoomState ? { ...defaultXZoomState(), ...raw.xZoomState } : defaultXZoomState();
  const yZoomState: YZoomState = raw?.yZoomState ? { ...defaultYZoomState(), ...raw.yZoomState } : defaultYZoomState();
  const ui: WorkspaceUiState = raw?.ui ? { ...defaultUiState(), ...raw.ui } : defaultUiState();
  const markers = Array.isArray(raw?.markers) ? raw.markers : [];
  const refLines = Array.isArray(raw?.refLines) ? raw.refLines : [];
  const savedNoise = Array.isArray(raw?.savedNoise) ? raw.savedNoise : [];
  const savedIP3 = Array.isArray(raw?.savedIP3) ? raw.savedIP3 : [];
  const analysisOpenState = normalizeAnalysisOpenState(raw?.analysisOpenState);
  const selectedTraceName = typeof raw?.selectedTraceName === "string" ? raw.selectedTraceName : null;

  return {
    version,
    files,
    derivedTraces,
    vis,
    paneMode,
    panes,
    paneRenderModes,
    activePaneId,
    traceAssignments,
    paneActiveTraceMap,
    xZoomState,
    yZoomState,
    ui,
    markers,
    refLines,
    savedNoise,
    savedIP3,
    analysisOpenState,
    selectedTraceName,
  };
}

// ---------------------------------------------------------------------------
// Build workspace snapshot from live state
// ---------------------------------------------------------------------------

/** Arguments for building a workspace snapshot from live application state. */
export interface BuildSnapshotArgs {
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
  readonly savedNoise: readonly unknown[];
  readonly savedIP3: readonly unknown[];
  readonly analysisOpenState: Record<string, boolean>;
  readonly selectedTraceName: string | null;
}

/** Build a normalized workspace snapshot from live state. */
export function buildSnapshot(args: BuildSnapshotArgs): WorkspaceSnapshot {
  return normalizeSnapshot({
    version: CURRENT_VERSION,
    files: args.files as RawFileRecord[],
    derivedTraces: [...args.derivedTraces],
    vis: { ...args.vis },
    paneMode: args.paneMode,
    panes: [...args.panes],
    paneRenderModes: { ...args.paneRenderModes },
    activePaneId: args.activePaneId,
    traceAssignments: { ...args.traceAssignments },
    paneActiveTraceMap: { ...args.paneActiveTraceMap },
    xZoomState: { ...args.xZoomState },
    yZoomState: { ...args.yZoomState },
    ui: { ...args.ui },
    markers: [...args.markers],
    refLines: [...args.refLines],
    savedNoise: [...args.savedNoise] as WorkspaceSnapshot["savedNoise"],
    savedIP3: [...args.savedIP3] as WorkspaceSnapshot["savedIP3"],
    analysisOpenState: { ...args.analysisOpenState },
    selectedTraceName: args.selectedTraceName,
  });
}

// ---------------------------------------------------------------------------
// Restore snapshot
// ---------------------------------------------------------------------------

/** Restore a workspace snapshot from JSON, with version migration. */
export function restoreSnapshot(json: string): WorkspaceSnapshot | null {
  try {
    const raw = JSON.parse(json) as Partial<WorkspaceSnapshot>;
    return normalizeSnapshot(raw);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Export package
// ---------------------------------------------------------------------------

/** Build a workspace export package. */
export function buildExportPackage(
  snapshot: WorkspaceSnapshot,
  appVersion?: string,
): WorkspaceExportPackage {
  const allTr: Trace[] = [];
  for (const file of snapshot.files ?? []) {
    if (Array.isArray(file.traces)) allTr.push(...file.traces);
  }
  const rawTraceCount = allTr.length;
  const derivedTraceCount = (snapshot.derivedTraces ?? []).length;

  return {
    kind: "mergen-scope-workspace",
    version: CURRENT_VERSION,
    app: appVersion ?? "mergen-scope",
    exportedAt: new Date().toISOString(),
    summary: {
      fileCount: (snapshot.files ?? []).length,
      rawTraceCount,
      derivedTraceCount,
    },
    snapshot,
  };
}
