import { useCallback } from 'react';
import { useTraceState, useTraceDispatch } from '../stores/trace-store';
import { usePaneState, usePaneDispatch } from '../stores/pane-store';
import { useUiDispatch } from '../stores/ui-store';
import { useOptionalAggregateWorkspace } from '../stores/aggregate-workspace-store';
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
  const uiDispatch = useUiDispatch();
  const aggregate = useOptionalAggregateWorkspace();

  const selectTrace = useCallback((traceName: string) => {
    uiDispatch({ type: 'SET', payload: { key: 'selectedTraceName', value: traceName } });

    const paneId = paneState.tracePaneMap[traceName]?.[0];
    if (paneId) { paneDispatch({ type: 'SET_PANE_ACTIVE_TRACE', payload: { paneId, traceName } }); paneDispatch({ type: 'SET_ACTIVE_PANE', payload: paneId }); }
  }, [uiDispatch, paneDispatch, paneState.tracePaneMap]);

  const removeTrace = useCallback((trace: Trace) => {
    if (aggregate) {
      aggregate.historyDispatch({type:'change',toastMessage:'Removed trace',command:{slice:'deleteTrace',traceId:trace.id}});
    }
    else if (trace.kind === 'derived') traceDispatch({ type: 'REMOVE_DERIVED', payload: trace.id });
  }, [aggregate, traceDispatch]);

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
      type: 'MOVE_MEMBERSHIP',
      payload: { trace, fromPaneId: paneState.activePaneId && paneState.tracePaneMap[trace.name]?.includes(paneState.activePaneId) ? paneState.activePaneId : paneState.tracePaneMap[trace.name]?.[0] ?? '', targetPaneId: paneId, allTraces: traceState.allTraces },
    });
    if (paneId) { paneDispatch({ type: 'SET_PANE_ACTIVE_TRACE', payload: { paneId, traceName } }); paneDispatch({ type: 'SET_ACTIVE_PANE', payload: paneId }); }
    uiDispatch({ type: 'SET', payload: { key: 'selectedTraceName', value: traceName } });
  }, [traceState.allTraces, paneState.activePaneId, paneState.tracePaneMap, paneDispatch, uiDispatch]);

  return {
    selectTrace,
    removeTrace,
    toggleVisibility,
    moveTraceToPane,
  };
}
