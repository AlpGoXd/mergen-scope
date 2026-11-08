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
  | { type: 'LOCK_LINE'; payload: { lineId: number; allPaneIds: string[] } }
  | { type: 'UNLOCK_LINE'; payload: { lineId: number } }
  | { type: 'MOVE_GROUP'; payload: { groupId: string; value: number } }
  | { type: 'RESTORE'; payload: RefLineState };

export const defaultRefLineState: RefLineState = {
  refLines: [],
  refMode: null,
  selectedRefLineId: null,
};

export const RefLineStateContext = createContext<RefLineState | null>(null);
export const RefLineDispatchContext = createContext<React.Dispatch<RefLineAction> | null>(null);

export function refLineReducer(state: RefLineState, action: RefLineAction): RefLineState {
  switch (action.type) {
    case 'ADD_LINE': {
      return { ...state, refLines: [...state.refLines, action.payload] };
    }
    case 'REMOVE_LINE': {
      const target = state.refLines.find(line => line.id === action.payload);
      if (!target) return state;
      const refLines = state.refLines.filter(line => target.groupId ? line.groupId !== target.groupId : line.id !== target.id);
      return {...state, refLines, selectedRefLineId:refLines.some(line => line.id === state.selectedRefLineId) ? state.selectedRefLineId : null};
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
    case 'LOCK_LINE': {
      const { lineId, allPaneIds } = action.payload;
      const line = state.refLines.find(l => l.id === lineId);
      if (!line || line.type !== 'v') return state;
      // If already locked, no-op
      if (line.groupId) return state;
      const now = Math.max(0, ...state.refLines.map(item => item.id));
      let serial = now + 1;
      const usedGroups = new Set(state.refLines.map(item => item.groupId));
      while (usedGroups.has(`line-group-${serial}`)) serial++;
      const groupId = `line-group-${serial}`;
      const updatedLines = state.refLines.map(l =>
        l.id === lineId ? { ...l, groupId } : l
      );
      // Create mirror lines in all other panes
      const linePaneId = line.paneId ?? allPaneIds[0];
      const mirrorLines: RefLine[] = allPaneIds
        .filter(pid => pid !== linePaneId)
        .map((pid, i) => ({
          id: serial + i,
          type: line.type,
          value: line.value,
          paneId: pid,
          groupId,
          label: line.label,
        }));
      return { ...state, refLines: [...updatedLines, ...mirrorLines] };
    }
    case 'UNLOCK_LINE': {
      const { lineId } = action.payload;
      const line = state.refLines.find(l => l.id === lineId);
      if (!line?.groupId) return state;
      const gid = line.groupId;
      return { ...state, refLines: state.refLines.flatMap(item => item.groupId !== gid ? [item] : item.id === lineId ? [{...item, groupId:null}] : []), selectedRefLineId: state.selectedRefLineId === null || state.refLines.some(item => item.id === state.selectedRefLineId && item.groupId !== gid) ? state.selectedRefLineId : lineId };

    }
    case 'MOVE_GROUP': {
      const { groupId, value } = action.payload;
      return {
        ...state,
        refLines: state.refLines.map(l =>
          l.groupId === groupId ? { ...l, value } : l
        ),
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
  const [state, dispatch] = useReducer(refLineReducer, defaultRefLineState);

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
