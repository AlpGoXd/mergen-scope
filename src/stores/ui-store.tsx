import React, { createContext, useContext, useReducer } from 'react';
import type { WorkspaceUiState } from '../types/workspace';

export interface UiState extends WorkspaceUiState {
  vis: Record<string, boolean>;
  selectedTraceName: string | null;
  paneAssignmentWarning: {
    message: string;
    paneId: string | null;
    traceName: string | null;
  } | null;
  activeWizard: {
    fileName: string;
    previewLines: string[];
    suggestedConfig: unknown;
    onConfirm: (fileName: string, config: unknown) => void;
    onCancel: (fileName: string) => void;
  } | null;
}

export type UiAction =
  | { type: 'TOGGLE'; payload: keyof UiState }
  | { type: 'SET'; payload: { key: keyof UiState; value: UiState[keyof UiState] } }
  | { type: 'SET_VIS'; payload: { name: string; visible: boolean } }
  | { type: 'SET_ALL_VIS'; payload: Record<string, boolean> }
  | { type: 'RESTORE'; payload: Partial<UiState> };

const defaultState: UiState = {
  showSidebar: true,
  showDetailedFiles: true,
  showRightPanel: false, // Hidden by default as part of v1 regression fix
  showDots: false,
  showMeta: true,
  showTouchstoneControls: false,
  showTraceOps: false,
  showAnalysisPanel: false, // Hidden by default
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
  traceColors: {},
  traceInterpolations: {},
  vis: {},
  selectedTraceName: null,
  paneAssignmentWarning: null,
  activeWizard: null,
};

const UiStateContext = createContext<UiState | null>(null);
const UiDispatchContext = createContext<React.Dispatch<UiAction> | null>(null);

function getInitialUiState(): UiState {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return defaultState;
  }
  const theme: UiState['theme'] = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return { ...defaultState, theme };
}

function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'TOGGLE': {
      const key = action.payload;
      return { ...state, [key]: !state[key] } as UiState;
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
  const [state, dispatch] = useReducer(uiReducer, undefined, getInitialUiState);

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
