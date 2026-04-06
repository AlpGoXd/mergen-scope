import React, { createContext, useContext, useReducer } from 'react';
import type { RefLine } from '../types/ref-line';

export interface RefLineState {
  refLines: RefLine[];
  refMode: "h" | "v" | null;
  selectedRefLineId: number | null;
}

export type RefLineAction =
  | { type: 'ADD_LINE'; payload: RefLine }
  | { type: 'REMOVE_LINE'; payload: number }
  | { type: 'UPDATE_LINE'; payload: { id: number; updates: Partial<RefLine> } }
  | { type: 'SET_MODE'; payload: "h" | "v" | null }
  | { type: 'SET_SELECTED'; payload: number | null }
  | { type: 'CLEANUP_ORPHANED_LINES'; payload: { paneIds: string[] } }
  | { type: 'RESTORE'; payload: RefLineState };

const defaultState: RefLineState = {
  refLines: [],
  refMode: null,
  selectedRefLineId: null,
};

const RefLineStateContext = createContext<RefLineState | null>(null);
const RefLineDispatchContext = createContext<React.Dispatch<RefLineAction> | null>(null);

function refLineReducer(state: RefLineState, action: RefLineAction): RefLineState {
  switch (action.type) {
    case 'ADD_LINE': {
      return { ...state, refLines: [...state.refLines, action.payload] };
    }
    case 'REMOVE_LINE': {
      return {
        ...state,
        refLines: state.refLines.filter(line => line.id !== action.payload),
        selectedRefLineId: state.selectedRefLineId === action.payload ? null : state.selectedRefLineId
      };
    }
    case 'UPDATE_LINE': {
      return {
        ...state,
        refLines: state.refLines.map(line =>
          line.id === action.payload.id ? { ...line, ...action.payload.updates } : line
        ),
      };
    }
    case 'SET_MODE': {
      return { ...state, refMode: action.payload };
    }
    case 'SET_SELECTED': {
      return { ...state, selectedRefLineId: action.payload };
    }
    case 'CLEANUP_ORPHANED_LINES': {
      const activePanes = new Set(action.payload.paneIds);
      const validLines = state.refLines.filter(line => 
        line.paneId === null || activePanes.has(line.paneId)
      );
      
      const newSelected = (state.selectedRefLineId !== null && !validLines.some(l => l.id === state.selectedRefLineId)) 
          ? null 
          : state.selectedRefLineId;

      return {
        ...state,
        refLines: validLines,
        selectedRefLineId: newSelected
      };
    }
    case 'RESTORE': {
      return action.payload;
    }
    default:
      return state;
  }
}

export function RefLineStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(refLineReducer, defaultState);

  return (
    <RefLineDispatchContext.Provider value={dispatch}>
      <RefLineStateContext.Provider value={state}>
        {children}
      </RefLineStateContext.Provider>
    </RefLineDispatchContext.Provider>
  );
}

export function useRefLineState(): RefLineState {
  const context = useContext(RefLineStateContext);
  if (!context) {
    throw new Error('useRefLineState must be used within a RefLineStoreProvider');
  }
  return context;
}

export function useRefLineDispatch(): React.Dispatch<RefLineAction> {
  const context = useContext(RefLineDispatchContext);
  if (!context) {
    throw new Error('useRefLineDispatch must be used within a RefLineStoreProvider');
  }
  return context;
}
