import React, { createContext, useContext, useReducer } from 'react';
import type { DataPoint } from '../types/trace';
import type { IP3Result } from '../domain/analysis/ip3';
import type { PeakTableRow, RangeStats } from '../domain/analysis/range-stats';
import type { BandwidthResult } from '../domain/analysis/bandwidth';
import type { RippleResult } from '../domain/analysis/ripple';
import type { AnalysisOpenState } from '../types/analysis';
import { setAnalysisOpenState, clearAllAnalysisOpenState, getDefaultAnalysisOpenState } from '../domain/analysis/registry';
import { createInstance, moveInstance, setCollapsed, updateParams } from '../domain/analysis/instances';
import type { AnalysisInstance } from '../types/analysis-instance';
import type { ParameterValue } from '../types/registry-contract';

export interface AnalysisState {
  analyses: AnalysisInstance[];
  nextAnalysisSerial: number;
  analysisOpenState: AnalysisOpenState;
  noiseResults: Record<string, DataPoint[]>;
  ip3Results: Record<string, IP3Result | null>;
  peakResults: Record<string, PeakTableRow[]>;
  bandwidthResults: Record<string, BandwidthResult | null>;
  rippleResults: Record<string, RippleResult | null>;
  rangeStatsResults: Record<string, RangeStats | null>;
}

export type AnalysisAction =
  | { type: 'ADD_ANALYSIS'; payload: { toolId: string; source: AnalysisInstance['source']; params?: Record<string, ParameterValue> } }
  | { type: 'REMOVE_ANALYSIS'; payload: { id: string } }
  | { type: 'SET_ANALYSIS_PARAMS'; payload: { id: string; params: Record<string, ParameterValue> } }
  | { type: 'SET_ANALYSIS_COLLAPSED'; payload: { id: string; collapsed: boolean } }
  | { type: 'MOVE_ANALYSIS'; payload: { id: string; index: number } }
  | { type: 'SET_ANALYSIS_LIVE'; payload: { id: string; live: boolean } }
  | { type: 'TOGGLE_PANEL'; payload: { id: string; forceValue?: boolean } }
  | { type: 'CLEAR_ALL_PANELS' }
  | { type: 'SET_NOISE_RESULT'; payload: { id: string; result: DataPoint[] | null } }
  | { type: 'SET_IP3_RESULT'; payload: { id: string; result: IP3Result | null } }
  | { type: 'SET_PEAKS_RESULT'; payload: { id: string; result: PeakTableRow[] | null } }
  | { type: 'SET_BANDWIDTH_RESULT'; payload: { id: string; result: BandwidthResult | null } }
  | { type: 'SET_RIPPLE_RESULT'; payload: { id: string; result: RippleResult | null } }
  | { type: 'SET_RANGE_STATS_RESULT'; payload: { id: string; result: RangeStats | null } }
  | { type: 'RESTORE'; payload: Partial<AnalysisState> };

export const defaultAnalysisState: AnalysisState = {
  analyses: [],
  nextAnalysisSerial: 1,
  analysisOpenState: getDefaultAnalysisOpenState(),
  noiseResults: {},
  ip3Results: {},
  peakResults: {},
  bandwidthResults: {},
  rippleResults: {},
  rangeStatsResults: {},
};

export const AnalysisStateContext = createContext<AnalysisState | null>(null);
export const AnalysisDispatchContext = createContext<React.Dispatch<AnalysisAction> | null>(null);

/** Keep the high-water mark through restoration, including IDs from loaded data. */
export function analysisSerialAfter(analyses: readonly AnalysisInstance[], minimum: number): number {
  return analyses.reduce((next, instance) => {
    const match = /^analysis-(\d+)$/.exec(instance.id);
    const serial = match?.[1] ? Number(match[1]) : 0;
    return Number.isSafeInteger(serial) ? Math.max(next, serial + 1) : next;
  }, Math.max(1, minimum));
}

export function analysisReducer(state: AnalysisState, action: AnalysisAction): AnalysisState {
  switch (action.type) {
    case 'ADD_ANALYSIS': {
      const serial = analysisSerialAfter(state.analyses, state.nextAnalysisSerial);
      const instance = createInstance(`analysis-${serial}`, action.payload.toolId, action.payload.source, action.payload.params);
      return instance ? { ...state, analyses: [...state.analyses, instance], nextAnalysisSerial: serial + 1 } : state;
    }
    case 'REMOVE_ANALYSIS': {
      const analyses = state.analyses.filter(instance => instance.id !== action.payload.id);
      return analyses.length === state.analyses.length ? state : { ...state, analyses };
    }
    case 'SET_ANALYSIS_PARAMS': {
      const analyses = state.analyses.map(instance => instance.id === action.payload.id ? updateParams(instance, action.payload.params) : instance);
      return analyses.every((item, index) => item === state.analyses[index]) ? state : { ...state, analyses };
    }
    case 'SET_ANALYSIS_COLLAPSED': {
      const analyses = state.analyses.map(instance => instance.id === action.payload.id ? setCollapsed(instance, action.payload.collapsed) : instance);
      return analyses.every((item, index) => item === state.analyses[index]) ? state : { ...state, analyses };
    }
    case 'MOVE_ANALYSIS': {
      const analyses = moveInstance(state.analyses, action.payload.id, action.payload.index);
      return analyses.every((item, index) => item === state.analyses[index]) ? state : { ...state, analyses };
    }
    case 'SET_ANALYSIS_LIVE': {
      const analyses = state.analyses.map(instance => instance.id === action.payload.id && instance.live !== action.payload.live ? { ...instance, live: action.payload.live } : instance);
      return analyses.every((item, index) => item === state.analyses[index]) ? state : { ...state, analyses };
    }
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
      if (result === null) delete nextNoise[id];
      else nextNoise[id] = result;
      return { ...state, noiseResults: nextNoise };
    }
    case 'SET_IP3_RESULT': {
      const { id, result } = action.payload;
      const nextIp3 = { ...state.ip3Results };
      if (result === null) delete nextIp3[id];
      else nextIp3[id] = result;
      return { ...state, ip3Results: nextIp3 };
    }
    case 'SET_PEAKS_RESULT': {
      const { id, result } = action.payload;
      const nextPeaks = { ...state.peakResults };
      if (result === null) delete nextPeaks[id];
      else nextPeaks[id] = result;
      return { ...state, peakResults: nextPeaks };
    }
    case 'SET_BANDWIDTH_RESULT': {
      const { id, result } = action.payload;
      const nextBW = { ...state.bandwidthResults };
      if (result === null) delete nextBW[id];
      else nextBW[id] = result;
      return { ...state, bandwidthResults: nextBW };
    }
    case 'SET_RIPPLE_RESULT': {
      const { id, result } = action.payload;
      const nextRipple = { ...state.rippleResults };
      if (result === null) delete nextRipple[id];
      else nextRipple[id] = result;
      return { ...state, rippleResults: nextRipple };
    }
    case 'SET_RANGE_STATS_RESULT': {
      const { id, result } = action.payload;
      const nextStats = { ...state.rangeStatsResults };
      if (result === null) delete nextStats[id];
      else nextStats[id] = result;
      return { ...state, rangeStatsResults: nextStats };
    }
    case 'RESTORE': {
      const analyses = action.payload.analyses ?? state.analyses;
      return {
        ...defaultAnalysisState,
        ...action.payload,
        analysisOpenState: action.payload.analysisOpenState ?? defaultAnalysisState.analysisOpenState,
        analyses,
        nextAnalysisSerial: action.payload.analyses === undefined ? state.nextAnalysisSerial : analysisSerialAfter(analyses, Math.max(state.nextAnalysisSerial, action.payload.nextAnalysisSerial ?? 1)),
      };
    }
    default:
      return state;
  }
}

export function AnalysisStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(analysisReducer, defaultAnalysisState);

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
