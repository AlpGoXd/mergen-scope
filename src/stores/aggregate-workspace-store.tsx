import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import { FileStateContext, FileDispatchContext } from './file-store';
import type { FileAction } from './file-store';
import { TraceStateContext, TraceDispatchContext } from './trace-store';
import type { TraceAction } from './trace-store';
import { PaneStateContext, PaneDispatchContext, PaneLimitContext } from './pane-store';
import type { PaneAction } from './pane-store';
import { MarkerStateContext, MarkerDispatchContext } from './marker-store';
import type { MarkerAction } from './marker-store';
import { RefLineStateContext, RefLineDispatchContext } from './ref-line-store';
import type { RefLineAction } from './ref-line-store';
import { AnalysisStateContext, AnalysisDispatchContext } from './analysis-store';
import type { AnalysisAction } from './analysis-store';
import { UiStoreAdapter } from './ui-store';
import type { UiAction } from './ui-store';
import type { TransactionHistory } from '../domain/transaction-history';
import { useOptionalToast } from './toast-store';
import type { WorkspaceState, WorkspaceAction } from './workspace/workspace-state';
import { traceView } from '../domain/workspace/workspace-trace-view';
import type { WorkspaceMemento } from './workspace/workspace-memento';
import { initialWorkspaceEngine, workspaceEngineReducer } from './workspace/workspace-engine';
import type { WorkspaceEngine, WorkspaceEngineAction } from './workspace/workspace-engine';

// Re-exports keep existing workspace imports working.
export { initialWorkspaceState } from './workspace/workspace-state';
export type { WorkspaceState, OpenDataCommand, WorkspaceAction } from './workspace/workspace-state';
export { traceView } from '../domain/workspace/workspace-trace-view';
export { captureWorkspace, sameWorkspaceMemento, restoreWorkspaceMemento } from './workspace/workspace-memento';
export type { WorkspaceMemento } from './workspace/workspace-memento';
export { snapshotFromWorkspace, workspaceFromSnapshot } from './workspace/workspace-snapshot';
export {
  planLastPaneRemoval,
  planWorkspacePaneRemoval,
  planLastPaneLines,
} from '../domain/workspace/workspace-pane-removal';
export { workspaceReducer } from './workspace/workspace-reducer';
export { initialWorkspaceEngine, workspaceEngineReducer } from './workspace/workspace-engine';
export type { WorkspaceEngine, WorkspaceEngineAction } from './workspace/workspace-engine';

const WorkspaceContext = createContext<{
  state: WorkspaceState;
  dispatch: React.Dispatch<WorkspaceAction>;
  history: TransactionHistory<WorkspaceMemento>;
  historyNotice: WorkspaceEngine['historyNotice'];
  historyDispatch: React.Dispatch<WorkspaceEngineAction>;
} | null>(null);

export function useOptionalAggregateWorkspace() {
  return useContext(WorkspaceContext);
}

export function useAggregateWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('Missing workspace provider');
  return value;
}

export function AggregateWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [engine, historyDispatch] = useReducer(workspaceEngineReducer, undefined, initialWorkspaceEngine);
  const show = useOptionalToast()?.show;
  useEffect(() => {
    if ((!engine.historyNotice && !engine.toastMessage) || !show) return;
    // History notices (pruned, too large) never raise a toast: the oldest step is dropped silently.
    if (!engine.toastMessage) {
      historyDispatch({ type: 'clear-notice' });
      return;
    }
    show({
      message: engine.toastMessage,
      ...(engine.historyNotice !== 'oversized' ? { undo: () => historyDispatch({ type: 'undo' }) } : {}),
    });
    historyDispatch({ type: 'clear-notice' });
  }, [engine.historyNotice, engine.toastMessage, show]);
  const state = engine.present;
  const dispatch = useCallback<React.Dispatch<WorkspaceAction>>(command => historyDispatch({ type: 'change', command }), []);
  const [limit, setLimit] = useState<4 | 8>(() => {
    try {
      return localStorage.getItem('mergen-experimental-eight-panes') === 'true' ? 8 : 4;
    } catch {
      return 4;
    }
  });
  const setExperimental = useCallback((enabled: boolean) => {
    setLimit(enabled ? 8 : 4);
    try {
      if (enabled) localStorage.setItem('mergen-experimental-eight-panes', 'true');
      else localStorage.removeItem('mergen-experimental-eight-panes');
    } catch { /* storage unavailable */ }
  }, []);
  const fileDispatch = useCallback<React.Dispatch<FileAction>>(action => dispatch({ slice: 'files', action, limit }), [limit]);
  const traceDispatch = useCallback<React.Dispatch<TraceAction>>(action => dispatch({ slice: 'traces', action }), []);
  const paneDispatch = useCallback<React.Dispatch<PaneAction>>(action => dispatch({ slice: 'panes', action, limit }), [limit]);
  const markerDispatch = useCallback<React.Dispatch<MarkerAction>>(action => dispatch({ slice: 'markers', action }), []);
  const lineDispatch = useCallback<React.Dispatch<RefLineAction>>(action => dispatch({ slice: 'lines', action }), []);
  const analysisDispatch = useCallback<React.Dispatch<AnalysisAction>>(action => dispatch({ slice: 'analysis', action }), []);
  const uiDispatch = useCallback<React.Dispatch<UiAction>>(action => dispatch({ slice: 'ui', action }), []);
  const view = useMemo(() => traceView(state.files, state.traces), [state.files, state.traces]);
  return <WorkspaceContext.Provider value={{
    state,
    dispatch,
    history: engine.history,
    historyNotice: engine.historyNotice,
    historyDispatch,
  }}>
    <UiStoreAdapter state={state.ui} dispatch={uiDispatch}>
      <AnalysisDispatchContext.Provider value={analysisDispatch}>
        <AnalysisStateContext.Provider value={state.analysis}>
          <MarkerDispatchContext.Provider value={markerDispatch}>
            <MarkerStateContext.Provider value={state.markers}>
              <RefLineDispatchContext.Provider value={lineDispatch}>
                <RefLineStateContext.Provider value={state.lines}>
                  <FileDispatchContext.Provider value={fileDispatch}>
                    <FileStateContext.Provider value={state.files}>
                      <TraceDispatchContext.Provider value={traceDispatch}>
                        <TraceStateContext.Provider value={view}>
                          <PaneLimitContext.Provider value={{ limit, setExperimental }}>
                            <PaneDispatchContext.Provider value={paneDispatch}>
                              <PaneStateContext.Provider value={state.panes}>
                                {children}
                              </PaneStateContext.Provider>
                            </PaneDispatchContext.Provider>
                          </PaneLimitContext.Provider>
                        </TraceStateContext.Provider>
                      </TraceDispatchContext.Provider>
                    </FileStateContext.Provider>
                  </FileDispatchContext.Provider>
                </RefLineStateContext.Provider>
              </RefLineDispatchContext.Provider>
            </MarkerStateContext.Provider>
          </MarkerDispatchContext.Provider>
        </AnalysisStateContext.Provider>
      </AnalysisDispatchContext.Provider>
    </UiStoreAdapter>
  </WorkspaceContext.Provider>;
}
