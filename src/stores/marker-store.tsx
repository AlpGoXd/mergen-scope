import React, { createContext, useContext, useReducer } from 'react';
import type { Marker, MarkerType } from '../types/marker';
import type { DataPoint } from '../types/trace';
import { placeMarker } from '../domain/markers';

export interface MarkerState {
  markers: Marker[];
  selectedMkrIdx: number;
  mkrMode: "normal" | "delta" | null;
  markerTrace: string; // The trace name to which new markers attach
}

export type MarkerAction =
  | { 
      type: 'PLACE_MARKER'; 
      payload: { 
        traceData: readonly DataPoint[]; 
        targetFreq: number; 
        traceName: string; 
        markerType?: MarkerType; 
        label?: string | null; 
        refIdx?: number | null;
      } 
    }
  | { type: 'REMOVE_MARKER'; payload: number } // remove by idx
  | { type: 'REMOVE_MARKERS_FOR_TRACES'; payload: string[] }
  | { type: 'CLEAR_ALL' }
  | { type: 'UPDATE_MARKER'; payload: { idx: number; updates: Partial<Marker> } }
  | { type: 'SET_SELECTED_IDX'; payload: number }
  | { type: 'SET_MODE'; payload: "normal" | "delta" | null }
  | { type: 'SET_TRACE'; payload: string }
  | { type: 'RESTORE'; payload: MarkerState };

const defaultState: MarkerState = {
  markers: [],
  selectedMkrIdx: -1,
  mkrMode: null,
  markerTrace: "",
};

const MarkerStateContext = createContext<MarkerState | null>(null);
const MarkerDispatchContext = createContext<React.Dispatch<MarkerAction> | null>(null);

function markerReducer(state: MarkerState, action: MarkerAction): MarkerState {
  switch (action.type) {
    case 'PLACE_MARKER': {
      const { targetFreq, traceData, traceName, markerType = 'normal', label = null, refIdx = null } = action.payload;
      const placement = placeMarker(traceData, targetFreq);
      
      const newMarker: Marker = {
        freq: placement.freq,
        amp: placement.amp,
        interpolated: placement.interpolated,
        trace: traceName,
        type: markerType,
        label,
        refIdx,
      };

      return {
        ...state,
        markers: [...state.markers, newMarker],
        selectedMkrIdx: state.markers.length, // Select the newly added marker
      };
    }
    case 'REMOVE_MARKER': {
      const targetIdx = action.payload;
      const newMarkers = state.markers.filter((_, idx) => idx !== targetIdx);

      // Adjust refIdx for remaining markers if necessary
      const updatedMarkers = newMarkers.map((m) => {
        if (m.refIdx === null) return m;
        if (m.refIdx === targetIdx) return { ...m, refIdx: null, type: 'normal' as MarkerType };
        if (m.refIdx > targetIdx) return { ...m, refIdx: m.refIdx - 1 };
        return m;
      });

      return {
        ...state,
        markers: updatedMarkers,
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
      
      // We don't try to automatically re-sync refIdx here if multiple removals happen across traces, 
      // but typically delta markers are on the same trace, so they also get removed.
      // If cross-trace delta markers are allowed, we'd need to clear them just like REMOVE_MARKER.
      const updatedMarkers = newMarkers.map((m) => {
        if (m.refIdx === null) return m;
        if (indicesToRemove.has(m.refIdx)) return { ...m, refIdx: null, type: 'normal' as MarkerType };
        // Adjust for all deleted indices that came before the refIdx
        let shift = 0;
        for (const r of indicesToRemove) {
          if (r < m.refIdx) shift++;
        }
        return { ...m, refIdx: m.refIdx - shift };
      });

      return {
        ...state,
        markers: updatedMarkers,
        selectedMkrIdx: -1, // Reset selection when massive changes happen
      };
    }
    case 'CLEAR_ALL': {
      return { ...state, markers: [], selectedMkrIdx: -1 };
    }
    case 'UPDATE_MARKER': {
      const { idx, updates } = action.payload;
      if (idx < 0 || idx >= state.markers.length) return state;
      const newMarkers = [...state.markers];
      newMarkers[idx] = { ...newMarkers[idx], ...updates };
      return { ...state, markers: newMarkers };
    }
    case 'SET_SELECTED_IDX': {
      return { ...state, selectedMkrIdx: action.payload };
    }
    case 'SET_MODE': {
      return { ...state, mkrMode: action.payload };
    }
    case 'SET_TRACE': {
      return { ...state, markerTrace: action.payload };
    }
    case 'RESTORE': {
      return action.payload;
    }
    default:
      return state;
  }
}

export function MarkerStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(markerReducer, defaultState);

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
