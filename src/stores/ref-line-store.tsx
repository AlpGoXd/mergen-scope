import React, { createContext, useContext, useReducer } from 'react';
import type { RefLine } from '../types/ref-line';
import { addLinePane, removeLinePane, setLinePanes } from '../domain/ref-lines';
import type { PlacementPane, PlacementTrace } from '../domain/pane-placement';

/** Visible range of one pane in axis units (null = unknown). Published by the pane for line views; never saved or undone. */
export interface PaneView { x: readonly [number, number] | null; y: readonly [number, number] | null }

export interface RefLineState {
  refLines: RefLine[];
  refMode: "h" | "v" | null;
  selectedRefLineId: number | null;
  /** The one line (hovered row, chart copy or edge tag) that lights every copy, its edge tags and its row. Transient. */
  hoveredRefLineId: number | null;
  /** Transient: current visible ranges per pane. */
  paneViews: Readonly<Record<string, PaneView>>;
}

export type RefLineAction =
  | { type: 'ADD_LINE'; payload: RefLine }
  | { type: 'REMOVE_LINE'; payload: number }
  | { type: 'UPDATE_LINE'; payload: { id: number; updates: Partial<RefLine> } }
  | { type: 'SET_MODE'; payload: "h" | "v" | null }
  | { type: 'SET_SELECTED'; payload: number | null }
  | { type: 'SET_HOVERED'; payload: number | null }
  | { type: 'SET_PANE_VIEW'; payload: { paneId: string; view: PaneView | null } }
  | { type: 'CLEANUP_ORPHANED_LINES'; payload: { paneIds: string[] } }
  | { type: 'ADD_LINE_PANE'; payload: { lineId: number; paneId: string; panes: readonly PlacementPane[]; entries: readonly PlacementTrace[] } }
  | { type: 'REMOVE_LINE_PANE'; payload: { lineId: number; paneId: string; axisUnit?: string | null } }
  | { type: 'SET_LINE_PANES'; payload: { lineId: number; paneIds: readonly string[]; panes: readonly PlacementPane[]; entries: readonly PlacementTrace[] } }
  | { type: 'RESTORE'; payload: RefLineState };

export const defaultRefLineState: RefLineState = {
  refLines: [],
  refMode: null,
  selectedRefLineId: null,
  hoveredRefLineId: null,
  paneViews: {},
};

export const RefLineStateContext = createContext<RefLineState | null>(null);
export const RefLineDispatchContext = createContext<React.Dispatch<RefLineAction> | null>(null);

export function refLineReducer(state: RefLineState, action: RefLineAction): RefLineState {
  switch (action.type) {
    case 'ADD_LINE': {
      const incoming = action.payload;
      if ((incoming.type === 'h' && incoming.paneIds.length > 1) || new Set(incoming.paneIds).size !== incoming.paneIds.length) return state;
      const prefix = incoming.type === 'v' ? 'V' : 'H';
      const duplicate = incoming.label && state.refLines.some(line => line.label === incoming.label);
      const used = state.refLines.flatMap(line => line.type === incoming.type && line.label?.startsWith(prefix) && /^\d+$/.test(line.label.slice(1)) ? [Number(line.label.slice(1))] : []);
      const label = duplicate ? `${prefix}${Math.max(0, ...used) + 1}` : incoming.label;
      return { ...state, refLines: [...state.refLines, { ...incoming, label }] };
    }
    case 'REMOVE_LINE': {
      const target = state.refLines.find(line => line.id === action.payload);
      if (!target) return state;
      const refLines = state.refLines.filter(line => line.id !== target.id);
      return {...state, refLines, selectedRefLineId:refLines.some(line => line.id === state.selectedRefLineId) ? state.selectedRefLineId : null};
    }
    case 'UPDATE_LINE': {
      const target = state.refLines.find(line => line.id === action.payload.id);
      if (action.payload.updates.paneIds || (action.payload.updates.type === 'h' && target && target.paneIds.length > 1)) return state;
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
    case 'SET_HOVERED': {
      return state.hoveredRefLineId === action.payload ? state : { ...state, hoveredRefLineId: action.payload };
    }
    case 'SET_PANE_VIEW': {
      const { paneId, view } = action.payload;
      const old = state.paneViews[paneId];
      const same = (a: readonly [number, number] | null | undefined, b: readonly [number, number] | null | undefined) => (a ?? null) === (b ?? null) || (!!a && !!b && a[0] === b[0] && a[1] === b[1]);
      if (view === null) {
        if (!old) return state;
        const { [paneId]: _removed, ...rest } = state.paneViews;
        return { ...state, paneViews: rest };
      }
      if (old && same(old.x, view.x) && same(old.y, view.y)) return state;
      return { ...state, paneViews: { ...state.paneViews, [paneId]: view } };
    }
    case 'CLEANUP_ORPHANED_LINES': {
      const activePanes = new Set(action.payload.paneIds);
      return { ...state, refLines: state.refLines.map(line => ({ ...line, paneIds: line.paneIds.filter(id => activePanes.has(id)) })) };
    }
    case 'ADD_LINE_PANE':
    case 'REMOVE_LINE_PANE':
    case 'SET_LINE_PANES': {
      const line = state.refLines.find(item => item.id === action.payload.lineId);
      if (!line) return state;
      const updated = action.type === 'REMOVE_LINE_PANE'
        ? removeLinePane(line, action.payload.paneId, action.payload.axisUnit)
        : action.type === 'ADD_LINE_PANE'
          ? addLinePane(line, action.payload.paneId, action.payload.panes, action.payload.entries).line
          : setLinePanes(line, action.payload.paneIds, action.payload.panes, action.payload.entries).line;
      return updated === line ? state : { ...state, refLines: state.refLines.map(item => item.id === line.id ? updated : item) };
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

/** Scope chart rendering and hit testing to placed lines. */
export function VisibleRefLinesProvider({ children }: { children: React.ReactNode }) {
  const state = useRefLineState();
  const value = React.useMemo(() => {
    const refLines = state.refLines.filter(line => line.paneIds.length > 0);
    return { ...state, refLines };
  }, [state]);
  return <RefLineStateContext.Provider value={value}>{children}</RefLineStateContext.Provider>;
}
