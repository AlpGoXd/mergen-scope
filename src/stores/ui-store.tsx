import React, { createContext, useContext, useReducer } from 'react';
import type { WorkspaceUiState } from '../types/workspace';

export interface UiState extends WorkspaceUiState {
  vis: Record<string, boolean>;
  selectedTraceName: string | null;
}

export type UiAction =
  | { type: 'TOGGLE'; payload: keyof UiState }
  | { type: 'SET'; payload: { key: keyof UiState; value: any } }
  | { type: 'SET_VIS'; payload: { name: string; visible: boolean } }
  | { type: 'SET_ALL_VIS'; payload: Record<string, boolean> }
  | { type: 'RESTORE'; payload: Partial<UiState> };

const defaultState: UiState = {
  showSidebar: true,
  showDots: false,
  showMeta: true,
  showTouchstoneControls: false,
  showTraceOps: false,
  showAnalysisPanel: false,
  showImportExportPanel: false,
  showMarkers: true,
  showMarkerTools: true,
  showPaneTools: true,
  showSearchTools: true,
  showLineTools: false,
  showViewTools: true,
  showDT: false,
  theme: 'dark',
  lockLinesAcrossPanes: false,
  searchDirection: 'right',
  newMarkerArmed: false,
  markerTrace: '__auto__',
  selectedMkrIdx: null,
  dRef: null,
  refMode: null,
  selectedRefLineId: null,
  traceOpsOpenSections: {
    offset: false,
    scale: false,
    smoothing: false,
    subtract: false,
  },
  noiseFilter: 'gaussian',
  noiseSource: null,
  ip3Gain: '',
  dtTrace: null,
  vis: {},
  selectedTraceName: null,
};

const UiStateContext = createContext<UiState | null>(null);
const UiDispatchContext = createContext<React.Dispatch<UiAction> | null>(null);

function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'TOGGLE': {
      const key = action.payload;
      return { ...state, [key]: !state[key] } as UiState; // Casting to avoid complex key issues
    }
    case 'SET': {
      return { ...state, [action.payload.key]: action.payload.value };
    }
    case 'SET_VIS': {
      return { ...state, vis: { ...state.vis, [action.payload.name]: action.payload.visible } };
    }
    case 'SET_ALL_VIS': {
      return { ...state, vis: action.payload };
    }
    case 'RESTORE': {
      return { ...defaultState, ...action.payload };
    }
    default:
      return state;
  }
}

export function UiStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(uiReducer, defaultState);

  return (
    <UiDispatchContext.Provider value={dispatch}>
      <UiStateContext.Provider value={state}>
        {children}
      </UiStateContext.Provider>
    </UiDispatchContext.Provider>
  );
}

export function useUiState(): UiState {
  const context = useContext(UiStateContext);
  if (!context) {
    throw new Error('useUiState must be used within a UiStoreProvider');
  }
  return context;
}

export function useUiDispatch(): React.Dispatch<UiAction> {
  const context = useContext(UiDispatchContext);
  if (!context) {
    throw new Error('useUiDispatch must be used within a UiStoreProvider');
  }
  return context;
}
