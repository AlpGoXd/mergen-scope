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
  WorkspaceDatasetRecord,
  WorkspaceDisplayTraceRecord,
} from "../types/workspace.ts";
import type { Trace } from "../types/trace.ts";
import type { Marker } from "../types/marker.ts";
import type { Pane } from "../types/pane.ts";
import type { RefLine } from "../types/ref-line.ts";
import type { RawFileRecord } from "../types/file.ts";
import { migrateWorkspaceSnapshot } from "./workspace-migrate-v4.ts";

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

const CURRENT_VERSION = 4;

/** Normalize a raw snapshot to fill defaults and clamp invalid values. */
export function normalizeSnapshot(raw: Partial<WorkspaceSnapshot> | null): WorkspaceSnapshot {
  return migrateWorkspaceSnapshot(raw);
}

// ---------------------------------------------------------------------------
// Build workspace snapshot from live state
// ---------------------------------------------------------------------------

/** Arguments for building a workspace snapshot from live application state. */
export interface BuildSnapshotArgs {
  readonly files: readonly RawFileRecord[];
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
    datasets: [...args.datasets],
    displayTraces: [...args.displayTraces],
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
    const raw = JSON.parse(json) as Partial<WorkspaceSnapshot> & { readonly kind?: string; readonly snapshot?: Partial<WorkspaceSnapshot> | null };
    if (raw && raw.kind === "mergen-scope-workspace" && raw.snapshot) {
      return normalizeSnapshot(raw.snapshot);
    }
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
