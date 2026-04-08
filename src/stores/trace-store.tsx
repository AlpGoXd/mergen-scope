import React, { createContext, useContext, useReducer, useEffect, useMemo } from 'react';
import type { Trace } from '../types/trace';
import type { Dataset } from '../types/dataset';
import type { DisplayTrace } from '../types/display';
import { reconcileDerivedTraceGraph } from '../domain/derived-state';
import { adaptDisplayTracesToLegacyTraces } from '../domain/display-trace-adapter';
import { useFileState } from './file-store';

export interface TraceState {
  derivedTraces: Trace[];
  vis: Record<string, boolean>;
}

export interface TraceContextValue extends TraceState {
  allTraces: Trace[];
  allDatasets: Dataset[];
  allDisplayTraces: DisplayTrace[];
}

export type TraceAction =
  | { type: 'ADD_DERIVED'; payload: Trace }
  | { type: 'REMOVE_DERIVED'; payload: string }
  | { type: 'REMOVE_MULTIPLE_DERIVED'; payload: string[] }
  | { type: 'RECONCILE'; payload: Trace[] }
  | { type: 'SET_VISIBILITY'; name: string; visible: boolean }
  | { type: 'SET_ALL_VISIBILITY'; visible: boolean }
  | { type: 'RESTORE'; payload: { derivedTraces: Trace[]; vis: Record<string, boolean> } };

const defaultState: TraceState = {
  derivedTraces: [],
  vis: {},
};

const TraceStateContext = createContext<TraceContextValue | null>(null);
const TraceDispatchContext = createContext<React.Dispatch<TraceAction> | null>(null);

function traceReducer(state: TraceState, action: TraceAction): TraceState {
  switch (action.type) {
    case 'ADD_DERIVED': {
      return { ...state, derivedTraces: [...state.derivedTraces, action.payload] };
    }
    case 'REMOVE_DERIVED': {
      // Run reconcile immediately with the SAME raw traces (we'll just let the external effect do full reconcile if needed)?
      // Actually, removing a trace might cascade to other derived traces if they depend on it.
      // We need rawTraces to reconcile properly right here... But we don't have it in the reducer.
      // So we just remove the one, and let the effect that watches derivedTraces maybe trigger? 
      // No, we can pass rawTraces to REMOVE_DERIVED if needed, or handle cascade at action dispatch time.
      return { 
        ...state, 
        derivedTraces: state.derivedTraces.filter(t => t.id !== action.payload) 
      };
    }
    case 'REMOVE_MULTIPLE_DERIVED': {
      const ids = new Set(action.payload);
      return {
        ...state,
        derivedTraces: state.derivedTraces.filter(t => !ids.has(t.id))
      };
    }
    case 'RECONCILE': {
      const rawTraces = action.payload;
      const result = reconcileDerivedTraceGraph(rawTraces, state.derivedTraces, []);
      // If none were removed because of bad dependencies, we can avoid state update
      if (result.removed.length === 0) return state;
      return { ...state, derivedTraces: [...result.kept] };
    }
    case 'SET_VISIBILITY': {
      return { 
        ...state, 
        vis: { ...state.vis, [action.name]: action.visible } 
      };
    }
    case 'SET_ALL_VISIBILITY': {
      const nextVis: Record<string, boolean> = {};
      // This is tricky without allTraces... but we can just use keys from current vis
      // or wait for the next reconcile/sync?
      // Actually, SET_ALL_VISIBILITY usually means "all current ones".
      Object.keys(state.vis).forEach(k => nextVis[k] = action.visible);
      return { ...state, vis: nextVis };
    }
    case 'RESTORE': {
      return { 
        ...state, 
        derivedTraces: action.payload.derivedTraces,
        vis: action.payload.vis || {}
      };
    }
    default:
      return state;
  }
}

export function TraceStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(traceReducer, defaultState);

  // Consume from FileStore
  const fileState = useFileState();

  const rawTraces = useMemo(() => {
    return fileState.files.flatMap((file) => {
      if (file.datasets && file.displayTraces) {
        return adaptDisplayTracesToLegacyTraces(
          file.datasets,
          file.displayTraces.filter((displayTrace) => !displayTrace.hidden),
          file,
        );
      }
      return file.traces;
    });
  }, [fileState.files]);

  const allDatasets = useMemo(() => {
    return fileState.files.flatMap((file) => file.datasets ?? []);
  }, [fileState.files]);

  const allDisplayTraces = useMemo(() => {
    return fileState.files.flatMap((file) => file.displayTraces ?? []);
  }, [fileState.files]);

  // Reconcile derived traces whenever raw traces change
  useEffect(() => {
    dispatch({ type: 'RECONCILE', payload: rawTraces });
  }, [rawTraces]);

  useEffect(() => {
    rawTraces.forEach((trace) => {
      if (state.vis[trace.name] === undefined) {
        dispatch({ type: 'SET_VISIBILITY', name: trace.name, visible: true });
      }
    });
  }, [rawTraces, state.vis]);

  const contextValue = useMemo<TraceContextValue>(() => {
    return {
      ...state,
      allTraces: [...rawTraces, ...state.derivedTraces],
      allDatasets,
      allDisplayTraces,
    };
  }, [state, rawTraces, allDatasets, allDisplayTraces]);

  return (
    <TraceDispatchContext.Provider value={dispatch}>
      <TraceStateContext.Provider value={contextValue}>
        {children}
      </TraceStateContext.Provider>
    </TraceDispatchContext.Provider>
  );
}

export function useTraceState(): TraceContextValue {
  const context = useContext(TraceStateContext);
  if (!context) {
    throw new Error('useTraceState must be used within a TraceStoreProvider');
  }
  return context;
}

export function useTraceDispatch(): React.Dispatch<TraceAction> {
  const context = useContext(TraceDispatchContext);
  if (!context) {
    throw new Error('useTraceDispatch must be used within a TraceStoreProvider');
  }
  return context;
}
