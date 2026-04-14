import { useCallback } from 'react';
import { useTraceState, useTraceDispatch } from '../stores/trace-store';
import { usePaneState, usePaneDispatch } from '../stores/pane-store';
import { useUiState, useUiDispatch } from '../stores/ui-store';
import { useMarkerDispatch } from '../stores/marker-store';
import { useFileDispatch, useFileState } from '../stores/file-store';
import type { Trace } from '../types/trace';

/**
 * Hook for high-level trace actions (select, remove, toggle, move).
 * Ported from app-controller.js trace interaction logic.
 */
export function useTraceActions() {
  const traceState = useTraceState();
  const traceDispatch = useTraceDispatch();
  const paneState = usePaneState();
  const paneDispatch = usePaneDispatch();
  const uiState = useUiState();
  const uiDispatch = useUiDispatch();
  const markerDispatch = useMarkerDispatch();
  const fileState = useFileState();
  const fileDispatch = useFileDispatch();

  const selectTrace = useCallback((traceName: string) => {
    uiDispatch({ type: 'SET', payload: { key: 'selectedTraceName', value: traceName } });

    const paneId = paneState.tracePaneMap[traceName] || 'pane-1';
    paneDispatch({ type: 'SET_PANE_ACTIVE_TRACE', payload: { paneId, traceName } });
    paneDispatch({ type: 'SET_ACTIVE_PANE', payload: paneId });
  }, [uiDispatch, paneDispatch, paneState.tracePaneMap]);

  const removeTrace = useCallback((trace: Trace) => {
    if (trace.kind === 'derived') {
      traceDispatch({ type: 'REMOVE_DERIVED', payload: trace.id });
    } else {
      const directFileId = trace.fileId !== undefined && trace.fileId !== null ? String(trace.fileId) : null;
      const ownerFile = directFileId
        ? fileState.files.find((file) => String(file.id) === directFileId) ?? null
        : fileState.files.find((file) => file.traces.some((item) => item.name === trace.name)) ?? null;
      const sourceDisplayTrace = ownerFile?.displayTraces?.find(
        (displayTrace) => (displayTrace.compat?.legacyTraceName ?? displayTrace.id) === trace.name,
      ) ?? null;

      if (ownerFile && sourceDisplayTrace) {
        fileDispatch({
          type: 'SET_DISPLAY_TRACE_HIDDEN',
          payload: {
            fileId: String(ownerFile.id),
            displayTraceId: sourceDisplayTrace.id,
            hidden: true,
          },
        });
      } else if (ownerFile) {
        fileDispatch({ type: 'REMOVE_FILE', payload: { fileId: String(ownerFile.id) } });
      }
    }

    markerDispatch({ type: 'REMOVE_MARKERS_FOR_TRACES', payload: [trace.name] });

    if (uiState.selectedTraceName === trace.name) {
      uiDispatch({ type: 'SET', payload: { key: 'selectedTraceName', value: null } });
    }

    if (uiState.markerTrace === trace.name) {
      uiDispatch({ type: 'SET', payload: { key: 'markerTrace', value: '__auto__' } });
    }

  }, [traceDispatch, fileDispatch, fileState.files, markerDispatch, uiState.selectedTraceName, uiState.markerTrace, uiDispatch]);

  const toggleVisibility = useCallback((traceName: string) => {
    const nextVis = !traceState.vis[traceName];
    traceDispatch({ type: 'SET_VISIBILITY', name: traceName, visible: nextVis });

    if (nextVis) {
      selectTrace(traceName);
    }
  }, [traceState.vis, traceDispatch, selectTrace]);

  const moveTraceToPane = useCallback((traceName: string, paneId: string) => {
    const trace = traceState.allTraces.find((t) => t.name === traceName);
    if (!trace) return;

    paneDispatch({
      type: 'ASSIGN_TRACE_TO_PANE',
      payload: { trace, targetPaneId: paneId, allTraces: traceState.allTraces },
    });
    paneDispatch({ type: 'SET_PANE_ACTIVE_TRACE', payload: { paneId, traceName } });
    paneDispatch({ type: 'SET_ACTIVE_PANE', payload: paneId });
    uiDispatch({ type: 'SET', payload: { key: 'selectedTraceName', value: traceName } });
  }, [traceState.allTraces, paneDispatch, uiDispatch]);

  return {
    selectTrace,
    removeTrace,
    toggleVisibility,
    moveTraceToPane,
  };
}
