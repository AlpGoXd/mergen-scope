import type { FileState } from '../file-store';
import type { TraceState } from '../trace-store';
import { analysisReducer } from '../analysis-store';
import { allocateColourBlindCreated } from '../../domain/trace-colors';
import { migrateWorkspaceV5 } from '../../domain/workspace-migrate-v5';
import { canPlaceMembership } from '../../domain/pane-placement';
import type { PlacementTrace } from '../../domain/pane-placement';
import type { WorkspaceSnapshotV5 } from '../../types/workspace-v5';
import type { RawFileRecord } from '../../types/file';
import { fallbackPreset } from '../../domain/pane-layout';
import type { WorkspaceState } from './workspace-state';
import { traceView } from '../../domain/workspace/workspace-trace-view';

/** Build a portable v5 snapshot from the actual live slices, never a history memento. */
export function snapshotFromWorkspace(state: WorkspaceState): WorkspaceSnapshotV5 | null {
  const { files, traces, panes, markers, lines, analysis, ui } = state;
  const paneIds = panes.panes.map(p => p.id);
  const layout = { ...state.layout, paneOrder: paneIds, sizes: state.layout.sizes };
  const body = {
    version: 4,
    files: files.files.map(file => ({
      ...file,
      ...(files.rawFileData[String(file.id)] !== undefined ? { rawText: files.rawFileData[String(file.id)] } : {}),
    })),
    datasets: files.files.flatMap(file => file.datasets ?? []),
    displayTraces: files.files.flatMap(file => file.displayTraces ?? []),
    derivedTraces: traces.derivedTraces,
    traceListOrder: traces.listOrder,
    vis: traces.vis,
    panes: panes.panes,
    paneMode: panes.panes.length,
    activePaneId: panes.activePaneId,
    traceAssignments: panes.tracePaneMap,
    paneActiveTraceMap: panes.paneActiveTraceMap,
    xZoomState: { zoomAll: false, sharedZoom: null, paneXZooms: panes.paneXZooms },
    yZoomState: { paneYZooms: panes.paneYZooms },
    markers: markers.markers,
    refLines: lines.refLines,
    ui: {
      ...ui,
      selectedRefLineId: lines.selectedRefLineId,
    },
    analysisOpenState: analysis.analysisOpenState,
    analyses: analysis.analyses,
    analysisResults: {
      noiseResults: analysis.noiseResults,
      ip3Results: analysis.ip3Results,
      peakResults: analysis.peakResults,
      bandwidthResults: analysis.bandwidthResults,
      rippleResults: analysis.rippleResults,
      rangeStatsResults: analysis.rangeStatsResults,
    },
    savedNoise: [],
    savedIP3: [],
    selectedTraceName: ui.selectedTraceName,
    layout,
  };
  const snapshot = migrateWorkspaceV5(body);
  if (!snapshot) return null;
  // Legacy migration fills missing selections; live state can explicitly select none.
  const paneActiveTraceMap = { ...snapshot.paneActiveTraceMap };
  for (const paneId of paneIds) if (panes.paneActiveTraceMap[paneId] === null) paneActiveTraceMap[paneId] = null;
  return { ...snapshot, paneActiveTraceMap };
}

/** Build a complete candidate first. Invalid memberships refuse restore without mutation. */
export function workspaceFromSnapshot(
  current: WorkspaceState,
  snapshot: WorkspaceSnapshotV5,
  sanitizeLegacy = false,
  limit: 4 | 8 = 8
): WorkspaceState | null {
  const files = snapshot.files.map(({ rawText: _rawText, ...file }) => file as RawFileRecord);
  const rawFileData = Object.fromEntries(snapshot.files.flatMap(file => typeof file.rawText === 'string'
    ? [[String(file.id), file.rawText]]
    : []));
  const fileState: FileState = { ...current.files, files, rawFileData, vis: { ...snapshot.vis }, wizardQueue: [] };
  const traceState: TraceState = {
    derivedTraces: [...snapshot.derivedTraces],
    vis: { ...snapshot.vis },
    ...(snapshot.traceListOrder ? { listOrder: snapshot.traceListOrder } : {}),
  };
  const view = traceView(fileState, traceState);
  const entries: PlacementTrace[] = view.allKnownTraces.map(trace => ({
    trace,
    paneIds: snapshot.traceAssignments[trace.name] ?? [],
    displayTrace: view.allDisplayTraces.find(display => display.id === trace.id || trace.parameters?.['displayTraceId'] === display.id),
  }));
  const accepted: (Omit<PlacementTrace, 'paneIds'> & { paneIds: string[] })[] = entries.map(entry => ({ ...entry, paneIds: [] }));
  for (const entry of entries) {
    const currentEntry = accepted.find(item => item.trace.name === entry.trace.name);
    if (!currentEntry) return null;
    for (const paneId of entry.paneIds) {
      if (!canPlaceMembership(currentEntry, paneId, snapshot.panes.map(p => ({ ...p, typed: p.typed ?? false })), accepted).allowed) {
        if (!sanitizeLegacy) return null;
        continue;
      }
      currentEntry.paneIds = [...currentEntry.paneIds, paneId];
    }
  }
  const safeAssignments = Object.fromEntries(accepted.map(entry => [entry.trace.name, [...entry.paneIds]]));
  const safeActive = Object.fromEntries(snapshot.panes.map(pane => {
    const selected = snapshot.paneActiveTraceMap[pane.id];
    return [pane.id, selected && safeAssignments[selected]?.includes(pane.id) ? selected : null];
  }));
  const orderedPanes = snapshot.layout.paneOrder
    .map(id => snapshot.panes.find(pane => pane.id === id))
    .filter(pane => pane !== undefined)
    .map(pane => ({
      ...pane,
      typed: pane.typed === true
        || Object.values(safeAssignments).some(ids => ids.includes(pane.id))
        || (pane.typed === undefined && pane.renderMode !== 'cartesian'),
    }));
  return {
    ...current,
    files: fileState,
    traces: traceState,
    panes: {
      ...current.panes,
      panes: orderedPanes,
      tracePaneMap: safeAssignments,
      issuedPaneIds: orderedPanes.map(p => p.id),
      paneActiveTraceMap: safeActive,
      activePaneId: snapshot.activePaneId,
      paneXZooms: { ...snapshot.xZoomState.paneXZooms },
      paneYZooms: { ...snapshot.yZoomState.paneYZooms },
    },
    markers: { ...current.markers, markers: [...snapshot.markers], selectedMkrIdx: -1, armed: null, nextMarkerSerial: 1 },
    lines: {
      ...current.lines,
      refLines: [...snapshot.refLines],
      refMode: null,
      selectedRefLineId: (snapshot.ui as typeof snapshot.ui & { selectedRefLineId?: number | null }).selectedRefLineId ?? null,
    },
    analysis: analysisReducer(current.analysis, {
      type: 'RESTORE',
      payload: { ...snapshot.analysisResults, analysisOpenState: snapshot.analysisOpenState, analyses: [...(snapshot.analyses ?? [])] },
    }),
    ui: {
      ...current.ui,
      ...snapshot.ui,
      traceHueSlots: Object.fromEntries(allocateColourBlindCreated(
        view.allKnownTraces,
        new Map(Object.entries(snapshot.ui.traceHueSlots ?? {}))
      )),
      selectedTraceName: snapshot.selectedTraceName,
      paneAssignmentWarning: null,
      activeWizard: null,
    },
    layout: { ...snapshot.layout, preset: fallbackPreset(snapshot.layout.preset, orderedPanes.length, limit) },
  };
}
