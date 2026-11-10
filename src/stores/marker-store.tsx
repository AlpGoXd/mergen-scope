import React, { createContext, useContext, useReducer } from 'react';
import type { Marker, MarkerType } from '../types/marker';
import type { Trace } from '../types/trace';
import { placeMarker, type MagneticSnapOptions } from '../domain/markers';

export interface MarkerState {
  markers: Marker[];
  nextMarkerSerial: number;
  selectedMkrIdx: number;
  armed: { kind: 'normal' } | { kind: 'delta'; refId: string } | null;
  markerTrace: string; // The trace name to which new markers attach
}

export type MarkerAction =
  | { type: 'PLACE_MARKERS'; payload: { trace: Trace; targetFreqs: readonly number[] } }
  | {
      type: 'PLACE_MARKER';
      payload: {
        trace: Trace;
        targetFreq: number;
        markerType?: MarkerType;
        label?: string | null;
        refId?: string | null;
        magneticSnap?: MagneticSnapOptions;
      }
    }
  | { type: 'REMOVE_MARKER'; payload: number } // remove by idx
  | { type: 'REMOVE_MARKERS_FOR_TRACES'; payload: string[] }
  | { type: 'CLEAR_ALL' }
  // Internal resolved-position command: callers use placeMarker before dispatch.
  | { type: 'UPDATE_MARKER'; payload: { idx: number; updates: Partial<Omit<Marker, 'id' | 'trace'>> } }
  | { type: 'SET_SELECTED_IDX'; payload: number }
  | { type: 'ARM'; payload: MarkerState['armed'] }
  | { type: 'SET_TRACE'; payload: string }
  | { type: 'RESTORE'; payload: MarkerState };

export const defaultMarkerState: MarkerState = {
  markers: [],
  nextMarkerSerial: 1,
  selectedMkrIdx: -1,
  armed: null,
  markerTrace: "",
};

export const MarkerStateContext = createContext<MarkerState | null>(null);
export const MarkerDispatchContext = createContext<React.Dispatch<MarkerAction> | null>(null);

export function markerReducer(state: MarkerState, action: MarkerAction): MarkerState {
  switch (action.type) {
    case 'PLACE_MARKERS': {
      const { trace, targetFreqs } = action.payload;
      return targetFreqs.reduce((current, targetFreq) => {
        if (!Number.isFinite(targetFreq) || current.markers.some(marker => marker.trace === trace.name && marker.freq === targetFreq)) return current;
        return markerReducer(current, { type: 'PLACE_MARKER', payload: { trace, targetFreq } });
      }, state);
    }
    case 'PLACE_MARKER': {
      const { targetFreq, trace, markerType = 'normal', label = null, refId = null, magneticSnap } = action.payload;
      const placement = placeMarker(trace, targetFreq, magneticSnap);
      
      let serial = state.nextMarkerSerial; const existing = new Set(state.markers.map(marker=>marker.id));
      while (existing.has(`marker-${serial}`)) serial++;
      if (markerType === 'delta' && (!refId || !state.markers.some(marker => marker.id === refId && marker.type !== 'delta'))) return state;
      const newMarker: Marker = {
        id: `marker-${serial}`,
        requestedFreq: placement.requestedFreq,
        freq: placement.freq,
        amp: placement.amp,
        interpolated: placement.interpolated,
        trace: trace.name,
        type: markerType,
        label,
        refId: markerType === 'delta' ? refId : null,
      };

      const newIdx = state.markers.length;
      const withNew = [...state.markers, newMarker];

      // A delta with a deleted reference is converted to normal at deletion time;
      // creating another marker must never reattach an existing marker.
      const finalMarkers = withNew;

      return {
        ...state,
        markers: finalMarkers,
        nextMarkerSerial: serial + 1,
        armed: null,
        selectedMkrIdx: newIdx,
      };
    }
    case 'REMOVE_MARKER': {
      const targetIdx = action.payload;
      const newMarkers = state.markers.filter((_, idx) => idx !== targetIdx);

      const removedId = state.markers[targetIdx]?.id;
      const updatedMarkers = newMarkers.map(m => m.refId === removedId ? { ...m, type: 'normal' as const, refId: null } : m);

      return {
        ...state,
        markers: updatedMarkers,
        armed: state.armed?.kind === 'delta' && state.armed.refId === removedId ? null : state.armed,
        selectedMkrIdx: state.selectedMkrIdx === targetIdx ? -1 : 
                        (state.selectedMkrIdx > targetIdx ? state.selectedMkrIdx - 1 : state.selectedMkrIdx)
      };
    }
    case 'REMOVE_MARKERS_FOR_TRACES': {
      const tracesToRemove = new Set(action.payload);
      
      // Determine which indices to keep vs remove
      const indicesToRemove = new Set<number>();
      state.markers.forEach((m, idx) => {
        if (tracesToRemove.has(m.trace)) {
          indicesToRemove.add(idx);
        }
      });
      
      if (indicesToRemove.size === 0) return state;

      const newMarkers = state.markers.filter((_, idx) => !indicesToRemove.has(idx));
      
      const removedIds = new Set(state.markers.filter((_, idx) => indicesToRemove.has(idx)).map(marker => marker.id));
      const updatedMarkers = newMarkers.map(m => m.refId && removedIds.has(m.refId) ? { ...m, type: 'normal' as const, refId: null } : m);

      return {
        ...state,
        markers: updatedMarkers,
        armed: state.armed?.kind === 'delta' && removedIds.has(state.armed.refId) ? null : state.armed,
        selectedMkrIdx: updatedMarkers.findIndex(marker => marker.id === state.markers[state.selectedMkrIdx]?.id),
      };
    }
    case 'CLEAR_ALL': {
      return { ...state, markers: [], selectedMkrIdx: -1, armed: null };
    }
    case 'UPDATE_MARKER': {
      const { idx, updates } = action.payload;
      if (idx < 0 || idx >= state.markers.length) return state;
      const newMarkers = [...state.markers];
      const current = newMarkers[idx];
      if (!current) return state;
      const moving = updates.requestedFreq !== undefined || updates.freq !== undefined || updates.amp !== undefined;
      if (moving && (![updates.requestedFreq, updates.freq, updates.amp].every(value => typeof value === 'number' && Number.isFinite(value)))) return state;
      const candidate = { ...current, ...updates, id: current.id, trace: current.trace };
      if (candidate.type === 'delta' && (!candidate.refId || candidate.refId === candidate.id || !state.markers.some(marker => marker.id === candidate.refId && marker.type !== 'delta'))) return state;
      newMarkers[idx] = candidate.type === 'delta' ? candidate : { ...candidate, refId: null };
      return { ...state, markers: newMarkers };
    }
    case 'SET_SELECTED_IDX': {
      return { ...state, selectedMkrIdx: action.payload };
    }
    case 'ARM': {
      const armed = action.payload;
      if (armed?.kind === 'delta' && !state.markers.some(marker => marker.id === armed.refId && marker.type !== 'delta')) return state;
      return { ...state, armed: action.payload };
    }
    case 'SET_TRACE': {
      return { ...state, markerTrace: action.payload };
    }
    case 'RESTORE': {
      const nextLoaded = action.payload.markers.reduce((next, marker) => { const match = /^marker-(\d+)$/.exec(marker.id); const serial = match ? Number(match[1]) : 0; return Number.isSafeInteger(serial) ? Math.max(next, serial + 1) : next; }, 1);
      return {...action.payload, nextMarkerSerial: Math.max(state.nextMarkerSerial, action.payload.nextMarkerSerial, nextLoaded)};
    }
    default:
      return state;
  }
}

export function MarkerStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(markerReducer, defaultMarkerState);

  return (
    <MarkerDispatchContext.Provider value={dispatch}>
      <MarkerStateContext.Provider value={state}>
        {children}
      </MarkerStateContext.Provider>
    </MarkerDispatchContext.Provider>
  );
}

export function useMarkerState(): MarkerState {
  const context = useContext(MarkerStateContext);
  if (!context) {
    throw new Error('useMarkerState must be used within a MarkerStoreProvider');
  }
  return context;
}

export function useMarkerDispatch(): React.Dispatch<MarkerAction> {
  const context = useContext(MarkerDispatchContext);
  if (!context) {
    throw new Error('useMarkerDispatch must be used within a MarkerStoreProvider');
  }
  return context;
}
