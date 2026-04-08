import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type { Pane, PaneRenderMode, YDomain } from '../types/pane';
import type { Trace } from '../types/trace';
import type { ZoomWindow } from '../types/marker';
import { 
  buildPanes, 
  normalizePanes, 
  normalizeTracePaneMap, 
  normalizePaneActiveTraceMap, 
  canAssignTraceToPane
} from '../domain/pane-math';
import { useTraceState } from './trace-store';

export interface PaneState {
  panes: Pane[];
  tracePaneMap: Record<string, string>;
  paneActiveTraceMap: Record<string, string | null>;
  activePaneId: string | null;
  // Zoom/Scaling state
  zoomAll: boolean;
  sharedZoom: ZoomWindow | null;
  paneXZooms: Record<string, ZoomWindow>;
  paneYZooms: Record<string, YDomain>;
}

export type PaneAction =
  | { type: 'SET_PANE_COUNT'; payload: number }
  | { type: 'ASSIGN_TRACE_TO_PANE'; payload: { trace: Trace; targetPaneId: string; allTraces: Trace[] } }
  | { type: 'SET_ACTIVE_PANE'; payload: string | null }
  | { type: 'SET_PANE_ACTIVE_TRACE'; payload: { paneId: string; traceName: string | null } }
  | { type: 'SET_RENDER_MODE'; payload: { paneId: string; mode: PaneRenderMode } }
  | { type: 'SET_PANE_TITLE'; payload: { paneId: string; title: string } }
  | { type: 'SET_ZOOM_ALL'; payload: boolean }
  | { type: 'SET_SHARED_ZOOM'; payload: ZoomWindow | null | ((prev: ZoomWindow | null) => ZoomWindow | null) }
  | { type: 'SET_PANE_ZOOM'; payload: { paneId: string; zoom: ZoomWindow | null | ((prev: ZoomWindow | null) => ZoomWindow | null) } }
  | { type: 'SET_PANE_Y_ZOOM'; payload: { paneId: string; zoom: YDomain | null } }
  | { type: 'CLEAR_ALL_ZOOMS' }
  | { type: 'RECONCILE'; payload: Trace[] }
  | { type: 'RESTORE'; payload: PaneState };

const defaultState: PaneState = {
  panes: buildPanes(1),
  tracePaneMap: {},
  paneActiveTraceMap: { 'pane-1': null },
  activePaneId: 'pane-1',
  zoomAll: true,
  sharedZoom: null,
  paneXZooms: {},
  paneYZooms: {},
};

const PaneStateContext = createContext<PaneState | null>(null);
const PaneDispatchContext = createContext<React.Dispatch<PaneAction> | null>(null);

function paneReducer(state: PaneState, action: PaneAction): PaneState {
  switch (action.type) {
    case 'SET_PANE_COUNT': {
      const mode = action.payload;
      const nextPanes = normalizePanes(state.panes, mode);
      
      // If we shrunk the panes, we might need to evacuate traces
      const validPaneIds = new Set(nextPanes.map(p => p.id));
      const nextTracePaneMap = { ...state.tracePaneMap };
      
      for (const [traceName, pid] of Object.entries(nextTracePaneMap)) {
        if (!validPaneIds.has(pid)) {
          nextTracePaneMap[traceName] = 'pane-1';
        }
      }

      // We won't have allTraces here to tightly clean up paneActiveTraceMap,
      // so we rely on the provider's useEffect to RECONCILE shortly after layout changes if allTraces changes,
      // but if allTraces is constant, we just drop invalid active traces.
      const nextActiveMap = { ...state.paneActiveTraceMap };
      for (const pid of Object.keys(nextActiveMap)) {
        if (!validPaneIds.has(pid)) delete nextActiveMap[pid];
      }
      
      let nextActivePaneId = state.activePaneId;
      if (nextActivePaneId && !validPaneIds.has(nextActivePaneId)) {
        nextActivePaneId = 'pane-1';
      }

      return {
        ...state,
        panes: nextPanes,
        tracePaneMap: nextTracePaneMap,
        paneActiveTraceMap: nextActiveMap,
        activePaneId: nextActivePaneId,
      };
    }
    case 'ASSIGN_TRACE_TO_PANE': {
      const { trace, targetPaneId, allTraces } = action.payload;
      
      const validation = canAssignTraceToPane(trace, targetPaneId, allTraces, state.tracePaneMap);
      if (!validation.allowed) {
        console.warn(`Cannot assign trace to pane: ${validation.reason}`);
        return state;
      }

      const nextTracePaneMap = { ...state.tracePaneMap, [trace.name]: targetPaneId };
      const nextPaneActiveTraceMap = normalizePaneActiveTraceMap(
        allTraces, 
        nextTracePaneMap, 
        state.panes, 
        state.paneActiveTraceMap
      );

      return {
        ...state,
        tracePaneMap: nextTracePaneMap,
        paneActiveTraceMap: nextPaneActiveTraceMap,
      };
    }
    case 'SET_ACTIVE_PANE': {
      return { ...state, activePaneId: action.payload };
    }
    case 'SET_PANE_ACTIVE_TRACE': {
      const { paneId, traceName } = action.payload;
      return {
        ...state,
        paneActiveTraceMap: { ...state.paneActiveTraceMap, [paneId]: traceName }
      };
    }
    case 'SET_RENDER_MODE': {
      const { paneId, mode } = action.payload;
      const nextPanes = state.panes.map(p => p.id === paneId ? { ...p, renderMode: mode } : p);
      return { ...state, panes: nextPanes };
    }
    case 'SET_PANE_TITLE': {
      const { paneId, title } = action.payload;
      const nextPanes = state.panes.map(p => p.id === paneId ? { ...p, title } : p);
      return { ...state, panes: nextPanes };
    }
    case 'SET_ZOOM_ALL': {
      return { ...state, zoomAll: action.payload };
    }
    case 'SET_SHARED_ZOOM': {
      const nextValue = typeof action.payload === 'function' ? action.payload(state.sharedZoom) : action.payload;
      return { ...state, sharedZoom: nextValue };
    }
    case 'SET_PANE_ZOOM': {
      const { paneId, zoom } = action.payload;
      const current = state.paneXZooms[paneId] || null;
      const nextValue = typeof zoom === 'function' ? zoom(current) : zoom;
      
      const nextXZooms = { ...state.paneXZooms };
      if (nextValue) nextXZooms[paneId] = nextValue;
      else delete nextXZooms[paneId];
      
      return { ...state, paneXZooms: nextXZooms };
    }
    case 'SET_PANE_Y_ZOOM': {
      const { paneId, zoom } = action.payload;
      const nextYZooms = { ...state.paneYZooms };
      if (zoom) nextYZooms[paneId] = zoom;
      else delete nextYZooms[paneId];
      return { ...state, paneYZooms: nextYZooms };
    }
    case 'CLEAR_ALL_ZOOMS': {
      return { ...state, sharedZoom: null, paneXZooms: {}, paneYZooms: {} };
    }
    case 'RECONCILE': {
      const allTraces = action.payload;
      const nextTracePaneMap = normalizeTracePaneMap(allTraces, state.tracePaneMap, state.panes);
      const nextPaneActiveTraceMap = normalizePaneActiveTraceMap(allTraces, nextTracePaneMap, state.panes, state.paneActiveTraceMap);
      return {
        ...state,
        tracePaneMap: nextTracePaneMap,
        paneActiveTraceMap: nextPaneActiveTraceMap
      };
    }
    case 'RESTORE': {
      return action.payload;
    }
    default:
      return state;
  }
}

export function PaneStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(paneReducer, defaultState);

  // Consume from TraceStore
  const traceState = useTraceState();
  const allTraces = traceState.allTraces;

  // Reconcile whenever the global trace list changes (files added/removed, traces derived)
  useEffect(() => {
    dispatch({ type: 'RECONCILE', payload: allTraces });
  }, [allTraces]);

  return (
    <PaneDispatchContext.Provider value={dispatch}>
      <PaneStateContext.Provider value={state}>
        {children}
      </PaneStateContext.Provider>
    </PaneDispatchContext.Provider>
  );
}

export function usePaneState(): PaneState {
  const context = useContext(PaneStateContext);
  if (!context) {
    throw new Error('usePaneState must be used within a PaneStoreProvider');
  }
  return context;
}

export function usePaneDispatch(): React.Dispatch<PaneAction> {
  const context = useContext(PaneDispatchContext);
  if (!context) {
    throw new Error('usePaneDispatch must be used within a PaneStoreProvider');
  }
  return context;
}
