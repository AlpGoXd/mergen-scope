import React, { createContext, useContext, useReducer, useEffect, useCallback, useState } from 'react';
import type { Pane, PaneRenderMode, PaneSettings, YDomain } from '../types/pane';
import type { Trace } from '../types/trace';
import type { DisplayTrace } from '../types/display';
import type { ZoomWindow } from '../types/marker';
import { buildPanes } from '../domain/pane-math';
import { canPlaceMembership, normalizeMemberships, planPaneRemoval, planPaneTypeChange } from '../domain/pane-placement';
import type { PlacementTrace } from '../domain/pane-placement';
import { useTraceState } from './trace-store';
import { useUiDispatch } from './ui-store';
import { useRefLineDispatch } from './ref-line-store';

export interface PaneState {
  panes: Pane[];
  tracePaneMap: Record<string, string[]>;
  issuedPaneIds: string[];
  paneActiveTraceMap: Record<string, string | null>;
  activePaneId: string | null;
  // Zoom/Scaling state
  zoomAll: boolean;
  sharedZoom: ZoomWindow | null;
  paneXZooms: Record<string, ZoomWindow>;
  paneYZooms: Record<string, YDomain>;
}

export type PaneAction =
  | { type: 'SET_PANE_COUNT'; payload: number; traces?: PlacementTrace[]; limit?: 4 | 8; confirmed?: boolean }
  | { type: 'ADD_MEMBERSHIP'; payload: { trace: Trace; targetPaneId: string; allTraces: Trace[]; displayTraces?: readonly DisplayTrace[] } }
  | { type: 'MOVE_MEMBERSHIP'; payload: { trace: Trace; fromPaneId: string; targetPaneId: string; allTraces: Trace[]; displayTraces?: readonly DisplayTrace[] } }
  | { type: 'REMOVE_MEMBERSHIP'; payload: { traceName: string; paneId: string } }
  | { type: 'ASSIGN_TRACE_TO_PANE'; payload: { trace: Trace; targetPaneId: string; allTraces: Trace[]; displayTraces?: readonly DisplayTrace[] } }
  | { type: 'SET_ACTIVE_PANE'; payload: string | null }
  | { type: 'SET_PANE_ACTIVE_TRACE'; payload: { paneId: string; traceName: string | null } }
  | { type: 'SET_RENDER_MODE'; payload: { paneId: string; mode: PaneRenderMode; traces?: PlacementTrace[]; confirmed?: boolean } }
  | { type: 'SET_PANE_TITLE'; payload: { paneId: string; title: string } }
  | { type: 'SET_ZOOM_ALL'; payload: boolean }
  | { type: 'SET_SHARED_ZOOM'; payload: ZoomWindow | null | ((prev: ZoomWindow | null) => ZoomWindow | null) }
  | { type: 'SET_PANE_ZOOM'; payload: { paneId: string; zoom: ZoomWindow | null | ((prev: ZoomWindow | null) => ZoomWindow | null) } }
  | { type: 'SET_PANE_Y_ZOOM'; payload: { paneId: string; zoom: YDomain | null } }
  | { type: 'CLEAR_ALL_ZOOMS' }
  | { type: 'SET_PANE_SETTINGS'; payload: { paneId: string; patch: Partial<PaneSettings> } }
  | { type: 'RECONCILE'; payload: Trace[] }
  | { type: 'RESTORE'; payload: PaneState };

export const defaultPaneState: PaneState = {
  panes: buildPanes(1),
  tracePaneMap: {},
  issuedPaneIds: ['pane-1'],
  paneActiveTraceMap: { 'pane-1': null },
  activePaneId: 'pane-1',
  zoomAll: true,
  sharedZoom: null,
  paneXZooms: {},
  paneYZooms: {},
};

export const PaneLimitContext = createContext<{ limit: 4 | 8; setExperimental: (enabled: boolean) => void } | null>(null);
export const PaneStateContext = createContext<PaneState | null>(null);
export const PaneDispatchContext = createContext<React.Dispatch<PaneAction> | null>(null);

export function paneReducer(state: PaneState, action: PaneAction): PaneState {
  switch (action.type) {
    case 'SET_PANE_COUNT': {
      const requested = Math.max(1, Math.min(8, Math.round(action.payload)));
      if (requested > state.panes.length && requested > (action.limit ?? 4)) return state;
      const count = requested;
      if (count === state.panes.length) return state;
      if (count > state.panes.length) {
        const panes = [...state.panes]; const issued = new Set(state.issuedPaneIds);
        while (panes.length < count) { let n = 1; while (issued.has(`pane-${n}`)) n++; const id = `pane-${n}`; issued.add(id); const target = panes.find(p => p.id === state.activePaneId) ?? panes[0]; if (!target) return state; panes.push({ ...target, id, title: '', settings: { ...target.settings } }); }
        return { ...state, panes, issuedPaneIds: [...issued] };
      }
      const removed = state.panes.slice(count).map(p => p.id);
      if (!action.traces && Object.values(state.tracePaneMap).some(ids => ids.some(id => removed.includes(id)))) return state;
      const plan = planPaneRemoval(state.panes, action.traces ?? [], removed); if (!plan.ok || (plan.plan.unplaced.length > 0 && !action.confirmed)) return state;
      const panes = state.panes.filter(p => !removed.includes(p.id)); const valid = new Set(panes.map(p => p.id));
      const keep = <T,>(map: Record<string,T>) => Object.fromEntries(Object.entries(map).filter(([id]) => valid.has(id)));
      return { ...state, panes, tracePaneMap: Object.fromEntries(Object.entries({...state.tracePaneMap,...plan.plan.memberships}).map(([name, ids]) => [name, [...ids]])), activePaneId: state.activePaneId && valid.has(state.activePaneId) ? state.activePaneId : panes[0]?.id ?? null, paneActiveTraceMap: keep(state.paneActiveTraceMap), paneXZooms: keep(state.paneXZooms), paneYZooms: keep(state.paneYZooms) };
    }
    case 'ASSIGN_TRACE_TO_PANE':
    case 'ADD_MEMBERSHIP':
    case 'MOVE_MEMBERSHIP': {
      const { trace, targetPaneId, allTraces, displayTraces = [] } = action.payload;
      const entry = (t: Trace): PlacementTrace => ({trace:t,paneIds:state.tracePaneMap[t.name] ?? [],displayTrace:displayTraces.find(display=>display.id===t.id || t.parameters?.['displayTraceId']===display.id)});
      const entries = allTraces.map(entry); const current=state.tracePaneMap[trace.name] ?? [];
      if (action.type === 'MOVE_MEMBERSHIP' && !current.includes(action.payload.fromPaneId)) return state;
      const validation = canPlaceMembership(entry(trace),targetPaneId,state.panes,entries); if (!validation.allowed) return state;
      const remaining=action.type === 'MOVE_MEMBERSHIP' ? current.filter(id=>id!==action.payload.fromPaneId) : current;
      const ids=[...new Set([...remaining,targetPaneId])]; const memberships={...state.tracePaneMap,[trace.name]:ids};
      const active=Object.fromEntries(state.panes.map(pane=>{const prior=state.paneActiveTraceMap[pane.id];const names=allTraces.filter(t=>memberships[t.name]?.includes(pane.id)).map(t=>t.name);return [pane.id,prior && names.includes(prior) ? prior : names[0] ?? null]}));
      return {...state,tracePaneMap:memberships,paneActiveTraceMap:active};
    }
    case 'REMOVE_MEMBERSHIP': {
      const {traceName,paneId}=action.payload; const current=state.tracePaneMap[traceName] ?? [];const memberships={...state.tracePaneMap,[traceName]:current.filter(id=>id!==paneId)};
      const active={...state.paneActiveTraceMap}; if(active[paneId]===traceName) active[paneId]=Object.keys(memberships).find(name=>memberships[name]?.includes(paneId)) ?? null;
      return {...state,tracePaneMap:memberships,paneActiveTraceMap:active};
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
      const target = state.panes.find(pane => pane.id === paneId); if (!target || target.renderMode === mode) return state;
      if (!action.payload.traces && Object.values(state.tracePaneMap).some(ids => ids.includes(paneId))) return state;
      const plan = planPaneTypeChange(state.panes, action.payload.traces ?? [], paneId, mode);
      if (!plan.ok || (plan.plan.requiresConfirmation && !action.payload.confirmed)) return state;
      const nextPanes = state.panes.map(p => p.id === paneId ? { ...p, renderMode: mode } : p);
      const memberships = Object.fromEntries(Object.entries({...state.tracePaneMap,...plan.plan.memberships}).map(([name,ids]) => [name,[...ids]]));
      const paneActiveTraceMap = Object.fromEntries(nextPanes.map(pane => {
        const old = state.paneActiveTraceMap[pane.id];
        const names = (action.payload.traces ?? []).filter(entry => memberships[entry.trace.name]?.includes(pane.id)).map(entry => entry.trace.name);
        return [pane.id,old && names.includes(old) ? old : names[0] ?? null];
      }));
      return { ...state, panes: nextPanes, tracePaneMap: memberships, paneActiveTraceMap };
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
    case 'SET_PANE_SETTINGS': {
      const { paneId, patch } = action.payload;
      return {
        ...state,
        panes: state.panes.map(p =>
          p.id === paneId ? { ...p, settings: { ...p.settings, ...patch } } : p
        ),
      };
    }
    case 'RECONCILE': {
      const nextTracePaneMap = normalizeMemberships(state.panes, action.payload.map(trace => ({trace,paneIds:state.tracePaneMap[trace.name] ?? []})));
      const paneActiveTraceMap = Object.fromEntries(state.panes.map(pane => { const current=state.paneActiveTraceMap[pane.id]; const names=action.payload.filter(trace=>nextTracePaneMap[trace.name]?.includes(pane.id)).map(trace=>trace.name); return [pane.id,current && names.includes(current) ? current : names[0] ?? null]; }));
      return {...state,tracePaneMap:nextTracePaneMap,paneActiveTraceMap};
    }
    case 'RESTORE': {
      return {...action.payload,issuedPaneIds:[...new Set([...state.issuedPaneIds,...action.payload.issuedPaneIds,...state.panes.map(p=>p.id),...action.payload.panes.map(p=>p.id)])]};
    }
    default:
      return state;
  }
}

export function PaneStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, rawDispatch] = useReducer(paneReducer, defaultPaneState);
  const [limit, setLimit] = useState<4 | 8>(() => { try { return localStorage.getItem('mergen-experimental-eight-panes') === 'true' ? 8 : 4; } catch { return 4; } });
  const setExperimental = useCallback((enabled: boolean) => { setLimit(enabled ? 8 : 4); try { if (enabled) localStorage.setItem('mergen-experimental-eight-panes','true'); else localStorage.removeItem('mergen-experimental-eight-panes'); } catch { /* Preference storage may be unavailable. */ } }, []);

  // Consume from TraceStore
  const traceState = useTraceState();
  const allKnownTraces = traceState.allKnownTraces;

  const refLineDispatch = useRefLineDispatch();
  const uiDispatch = useUiDispatch();
  const paneCount = state.panes.length;
  const dispatch = useCallback<React.Dispatch<PaneAction>>((action) => {
    const entries = () => allKnownTraces.map(trace=>({trace,paneIds:state.tracePaneMap[trace.name] ?? [],displayTrace:traceState.allDisplayTraces.find(display=>display.id===trace.id)}));
    const refuse = (message: string, paneId: string | null) => uiDispatch({type:'SET',payload:{key:'paneAssignmentWarning',value:{message,paneId,traceName:null}}});
    if(action.type === 'SET_PANE_COUNT') {
      const traces = entries();
      if (action.payload < state.panes.length && !action.confirmed) {
        const plan = planPaneRemoval(state.panes,traces,state.panes.slice(action.payload).map(pane => pane.id));
        if (!plan.ok || plan.plan.unplaced.length) { refuse(plan.ok ? 'Removing these panes would leave traces unplaced; confirmation is required.' : plan.reason,state.activePaneId); return; }
      }
      rawDispatch({...action,limit,traces});
    }
    else if (action.type === 'ASSIGN_TRACE_TO_PANE') rawDispatch({type:action.type,payload:{...action.payload,allTraces:allKnownTraces,displayTraces:traceState.allDisplayTraces}});
    else if (action.type === 'ADD_MEMBERSHIP') rawDispatch({type:action.type,payload:{...action.payload,allTraces:allKnownTraces,displayTraces:traceState.allDisplayTraces}});
    else if (action.type === 'MOVE_MEMBERSHIP') rawDispatch({type:action.type,payload:{...action.payload,allTraces:allKnownTraces,displayTraces:traceState.allDisplayTraces}});
    else if (action.type === 'SET_RENDER_MODE') {
      const traces=entries(); const plan=planPaneTypeChange(state.panes,traces,action.payload.paneId,action.payload.mode);
      if (!plan.ok || (plan.plan.requiresConfirmation && !action.payload.confirmed)) { refuse(plan.ok ? 'Changing this pane would leave traces unplaced; confirmation is required.' : plan.reason,action.payload.paneId); return; }
      rawDispatch({...action,payload:{...action.payload,traces}});
    }
    else rawDispatch(action);
  }, [allKnownTraces,state.tracePaneMap,state.panes,state.activePaneId,traceState.allDisplayTraces,limit,uiDispatch]);

  // Reconcile whenever the global trace list or the pane count changes
  useEffect(() => {
    rawDispatch({ type: 'RECONCILE', payload: allKnownTraces });
  }, [allKnownTraces, paneCount]);

  // Reference lines of removed panes would otherwise reappear when the pane id is reused.
  useEffect(() => {
    refLineDispatch({
      type: 'CLEANUP_ORPHANED_LINES',
      payload: { paneIds: state.panes.map(pane => pane.id) },
    });
  }, [state.panes, refLineDispatch]);

  return (
    <PaneLimitContext.Provider value={{limit,setExperimental}}>
    <PaneDispatchContext.Provider value={dispatch}>
      <PaneStateContext.Provider value={state}>
        {children}
      </PaneStateContext.Provider>
    </PaneDispatchContext.Provider>
    </PaneLimitContext.Provider>
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

export function usePaneLimit() { const value = useContext(PaneLimitContext); if (!value) throw new Error('usePaneLimit must be used within a PaneStoreProvider'); return value; }
