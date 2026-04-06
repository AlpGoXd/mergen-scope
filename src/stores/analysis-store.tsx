import React, { createContext, useContext, useReducer } from 'react';
import type { AnalysisOpenState } from '../types/analysis';
import type { IP3Result } from '../domain/analysis/ip3';
import type { DataPoint } from '../types/trace';
import { setAnalysisOpenState, clearAllAnalysisOpenState, getDefaultAnalysisOpenState } from '../domain/analysis/registry';

export interface AnalysisState {
  analysisOpenState: AnalysisOpenState;
  noiseResults: Record<string, DataPoint[]>; // traceName -> PSD points
  ip3Results: Record<string, IP3Result | null>; // traceName or unique id -> result
}

export type AnalysisAction =
  | { type: 'TOGGLE_PANEL'; payload: { id: string; forceValue?: boolean } }
  | { type: 'CLEAR_ALL_PANELS' }
  | { type: 'SET_NOISE_RESULT'; payload: { id: string; result: DataPoint[] | null } }
  | { type: 'SET_IP3_RESULT'; payload: { id: string; result: IP3Result | null } }
  | { type: 'RESTORE'; payload: Partial<AnalysisState> };

const defaultState: AnalysisState = {
  analysisOpenState: getDefaultAnalysisOpenState(),
  noiseResults: {},
  ip3Results: {},
};

const AnalysisStateContext = createContext<AnalysisState | null>(null);
const AnalysisDispatchContext = createContext<React.Dispatch<AnalysisAction> | null>(null);

function analysisReducer(state: AnalysisState, action: AnalysisAction): AnalysisState {
  switch (action.type) {
    case 'TOGGLE_PANEL': {
      const nextOpenState = setAnalysisOpenState(
        state.analysisOpenState, 
        action.payload.id, 
        action.payload.forceValue
      );
      return { ...state, analysisOpenState: nextOpenState };
    }
    case 'CLEAR_ALL_PANELS': {
      return { ...state, analysisOpenState: clearAllAnalysisOpenState(state.analysisOpenState) };
    }
    case 'SET_NOISE_RESULT': {
      const { id, result } = action.payload;
      const nextNoise = { ...state.noiseResults };
      if (result === null) {
        delete nextNoise[id];
      } else {
        nextNoise[id] = result;
      }
      return { ...state, noiseResults: nextNoise };
    }
    case 'SET_IP3_RESULT': {
      const { id, result } = action.payload;
      const nextIp3 = { ...state.ip3Results };
      if (result === null) {
        delete nextIp3[id];
      } else {
        nextIp3[id] = result;
      }
      return { ...state, ip3Results: nextIp3 };
    }
    case 'RESTORE': {
      // Typically we don't restore large computed arrays from a workspace save.
      // We restore open state, and re-compute the rest.
      return {
        ...defaultState,
        ...action.payload,
        // Override nested structures if provided
        analysisOpenState: action.payload.analysisOpenState ?? defaultState.analysisOpenState,
      };
    }
    default:
      return state;
  }
}

export function AnalysisStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(analysisReducer, defaultState);

  return (
    <AnalysisDispatchContext.Provider value={dispatch}>
      <AnalysisStateContext.Provider value={state}>
        {children}
      </AnalysisStateContext.Provider>
    </AnalysisDispatchContext.Provider>
  );
}

export function useAnalysisState(): AnalysisState {
  const context = useContext(AnalysisStateContext);
  if (!context) {
    throw new Error('useAnalysisState must be used within an AnalysisStoreProvider');
  }
  return context;
}

export function useAnalysisDispatch(): React.Dispatch<AnalysisAction> {
  const context = useContext(AnalysisDispatchContext);
  if (!context) {
    throw new Error('useAnalysisDispatch must be used within an AnalysisStoreProvider');
  }
  return context;
}
