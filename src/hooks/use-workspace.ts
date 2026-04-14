import { useCallback } from 'react';
import { useFileState, useFileDispatch } from '../stores/file-store';
import { useTraceState, useTraceDispatch } from '../stores/trace-store';
import { usePaneState, usePaneDispatch } from '../stores/pane-store';
import { useMarkerState, useMarkerDispatch } from '../stores/marker-store';
import { useRefLineState, useRefLineDispatch } from '../stores/ref-line-store';
import { useAnalysisState, useAnalysisDispatch } from '../stores/analysis-store';
import { useUiState, useUiDispatch } from '../stores/ui-store';
import { buildSnapshot, restoreSnapshot, buildExportPackage } from '../domain/workspace-serialize';
import type { WorkspaceSnapshot, WorkspaceUiState, WorkspaceDatasetRecord, WorkspaceDisplayTraceRecord, XZoomState, YZoomState } from '../types/workspace';
import type { RawFileRecord } from '../types/file';

/**
 * Hook for managing workspace save/restore operations.
 * Ported from app-controller.js workspace ops.
 */
export function useWorkspace() {
  const fileState = useFileState();
  const traceState = useTraceState();
  const paneState = usePaneState();
  const markerState = useMarkerState();
  const refLineState = useRefLineState();
  const analysisState = useAnalysisState();
  const uiState = useUiState();

  const fileDispatch = useFileDispatch();
  const traceDispatch = useTraceDispatch();
  const paneDispatch = usePaneDispatch();
  const markerDispatch = useMarkerDispatch();
  const refLineDispatch = useRefLineDispatch();
  const analysisDispatch = useAnalysisDispatch();
  const uiDispatch = useUiDispatch();

  const getSnapshot = useCallback((): WorkspaceSnapshot => {
    // Map individual store states into the WorkspaceUiState shape
    const ui: WorkspaceUiState = {
      ...uiState,
      newMarkerArmed: false, // Not persisted in v1 typically
      markerTrace: uiState.markerTrace,
      selectedMkrIdx: markerState.selectedMkrIdx,
      dRef: null,
      refMode: refLineState.refMode,
      selectedRefLineId: refLineState.selectedRefLineId,
      // The following might come from AnalysisStore or UiStore depending on final split
      noiseFilter: 'gaussian', 
      noiseSource: null,
      ip3Gain: '',
      dtTrace: null,
      lockLinesAcrossPanes: false,
      searchDirection: 'left',
      showDT: false,
      traceInterpolations: uiState.traceInterpolations,
    };

    const xZoomState: XZoomState = {
      zoomAll: paneState.zoomAll,
      sharedZoom: paneState.sharedZoom,
      paneXZooms: paneState.paneXZooms,
    };

    const yZoomState: YZoomState = {
      paneYZooms: paneState.paneYZooms,
    };

    return buildSnapshot({
      files: fileState.files,
      datasets: fileState.files.flatMap((file) => (file.datasets ?? []) as readonly WorkspaceDatasetRecord[]),
      displayTraces: fileState.files.flatMap((file) => (file.displayTraces ?? []) as readonly WorkspaceDisplayTraceRecord[]),
      derivedTraces: traceState.derivedTraces,
      vis: traceState.vis,
      paneMode: paneState.panes.length, // Rough estimate if not explicitly stored
      panes: paneState.panes,
      paneRenderModes: {}, // Need to add to PaneStore if used
      activePaneId: paneState.activePaneId || 'pane-1',
      traceAssignments: paneState.tracePaneMap,
      paneActiveTraceMap: paneState.paneActiveTraceMap,
      xZoomState,
      yZoomState,
      ui,
      markers: markerState.markers,
      refLines: refLineState.refLines,
      savedNoise: [], // Map from analysisState.noiseResults if serializable
      savedIP3: [],
      analysisOpenState: analysisState.analysisOpenState,
      selectedTraceName: uiState.selectedTraceName,
    });
  }, [fileState, traceState, paneState, markerState, refLineState, analysisState, uiState]);

  const restore = useCallback((snapshot: WorkspaceSnapshot) => {
    // 1. Files
    fileDispatch({
      type: 'RESTORE_FILES',
      payload: {
        files: [...snapshot.files] as RawFileRecord[],
        rawFileData: {},
        vis: { ...snapshot.vis },
        wizardQueue: [],
      }
    });
    
    // 2. Traces (vis + derived)
    traceDispatch({ type: 'RESTORE', payload: { vis: { ...snapshot.vis }, derivedTraces: [...snapshot.derivedTraces] } });
    
    // 3. Panes (layout + assignments + zooms)
    paneDispatch({ 
      type: 'RESTORE', 
      payload: { 
        panes: [...snapshot.panes],
        activePaneId: snapshot.activePaneId,
        tracePaneMap: { ...snapshot.traceAssignments },
        paneActiveTraceMap: { ...snapshot.paneActiveTraceMap },
        zoomAll: snapshot.xZoomState.zoomAll,
        sharedZoom: snapshot.xZoomState.sharedZoom,
        paneXZooms: { ...snapshot.xZoomState.paneXZooms },
        paneYZooms: { ...snapshot.yZoomState.paneYZooms },
      }
    });

    // 4. Markers
    markerDispatch({ 
      type: 'RESTORE', 
      payload: { 
        markers: [...snapshot.markers],
        selectedMkrIdx: snapshot.ui.selectedMkrIdx ?? -1,
        mkrMode: 'normal', // Default or from snapshot.ui.mkrMode?
        markerTrace: snapshot.ui.markerTrace || '',
      }
    });

    // 5. RefLines
    refLineDispatch({
      type: 'RESTORE',
      payload: {
        refLines: [...snapshot.refLines],
        refMode: snapshot.ui.refMode,
        selectedRefLineId: snapshot.ui.selectedRefLineId,
      }
    });

    // 6. Analysis
    analysisDispatch({
      type: 'RESTORE',
      payload: {
        analysisOpenState: snapshot.analysisOpenState,
      }
    });

    // 7. UI
    uiDispatch({
      type: 'RESTORE',
      payload: {
        ...snapshot.ui,
        selectedTraceName: snapshot.selectedTraceName,
      }
    });
  }, [fileDispatch, traceDispatch, paneDispatch, markerDispatch, refLineDispatch, analysisDispatch, uiDispatch]);

  const downloadWorkspace = useCallback((name?: string) => {
    const snapshot = getSnapshot();
    const pkg = buildExportPackage(snapshot);
    const json = JSON.stringify(pkg, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name || 'mergen-workspace'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [getSnapshot]);

  const loadFromFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      const snapshot = restoreSnapshot(text);
      if (snapshot) restore(snapshot);
    };
    reader.readAsText(file);
  }, [restore]);

  return {
    getSnapshot,
    restore,
    downloadWorkspace,
    loadFromFile,
  };
}
