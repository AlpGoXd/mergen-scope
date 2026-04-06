import { useCallback } from 'react';
import { useTraceState, useTraceDispatch } from '../stores/trace-store';
import { usePaneState, usePaneDispatch } from '../stores/pane-store';
import { useUiState, useUiDispatch } from '../stores/ui-store';
import { useMarkerState, useMarkerDispatch } from '../stores/marker-store';

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
  const markerState = useMarkerState();
  const markerDispatch = useMarkerDispatch();

  const selectTrace = useCallback((traceName: string) => {
    // 1. Set as selected in UI
    uiDispatch({ type: 'SET_SELECTED_TRACE', name: traceName });
    
    // 2. Set as active in its pane
    const paneId = paneState.tracePaneMap[traceName] || 'pane-1';
    paneDispatch({ type: 'SET_PANE_ACTIVE_TRACE', paneId, traceName });
    paneDispatch({ type: 'SET_ACTIVE_PANE', paneId });
  }, [uiDispatch, paneDispatch, paneState.tracePaneMap]);

  const removeTrace = useCallback((traceId: string, traceName: string) => {
    // 1. Remove from trace store (vis + data)
    traceDispatch({ type: 'REMOVE_TRACE', id: traceId, name: traceName });
    
    // 2. Remove from pane mappings
    paneDispatch({ type: 'REMOVE_TRACE_ASSIGNMENT', traceName });
    
    // 3. Cleanup UI state if it was selected
    if (uiState.selectedTraceName === traceName) {
      uiDispatch({ type: 'SET_SELECTED_TRACE', name: null });
    }
    
    // 4. Cleanup markers if they were pointing to this trace
    if (markerState.markerTrace === traceName) {
      markerDispatch({ type: 'SET_MARKER_TRACE', name: '__auto__' });
    }
  }, [traceDispatch, paneDispatch, uiState.selectedTraceName, uiDispatch, markerState.markerTrace, markerDispatch]);

  const toggleVisibility = useCallback((traceName: string) => {
    const nextVis = !traceState.vis[traceName];
    traceDispatch({ type: 'SET_VISIBILITY', name: traceName, visible: nextVis });
    
    if (nextVis) {
      selectTrace(traceName);
    }
  }, [traceState.vis, traceDispatch, selectTrace]);

  const moveTraceToPane = useCallback((traceName: string, paneId: string) => {
    paneDispatch({ type: 'ASSIGN_TRACE_TO_PANE', traceName, paneId });
    paneDispatch({ type: 'SET_PANE_ACTIVE_TRACE', paneId, traceName });
    paneDispatch({ type: 'SET_ACTIVE_PANE', paneId });
    uiDispatch({ type: 'SET_SELECTED_TRACE', name: traceName });
  }, [paneDispatch, uiDispatch]);

  return {
    selectTrace,
    removeTrace,
    toggleVisibility,
    moveTraceToPane,
  };
}
