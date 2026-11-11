import React, { createContext, useContext, useReducer, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import type { WorkspaceUiState } from '../types/workspace';
import type { TraceColorAssignment } from '../domain/trace-palette';
import { readAppPreferences } from '../components/settings/app-preferences';

export interface UiState extends WorkspaceUiState {
  traceHueSlots: Readonly<Record<string, TraceColorAssignment>>;
  huePalette: 'standard' | 'colour-blind';
  vis: Record<string, boolean>;
  selectedTraceName: string | null;
  paneAssignmentWarning: {
    message: string;
    source?: 'drop';
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

export function showPaneWarningBanner(warning: UiState['paneAssignmentWarning'], mountedPaneIds: readonly string[]): boolean {
  return !!warning && (warning.source !== 'drop' || !warning.paneId || !mountedPaneIds.includes(warning.paneId));
}

export type UiAction =
  | { type: 'TOGGLE'; payload: keyof UiState }
  | { type: 'SET'; payload: { key: keyof UiState; value: UiState[keyof UiState] } }
  | { type: 'SET_VIS'; payload: { name: string; visible: boolean } }
  | { type: 'SET_ALL_VIS'; payload: Record<string, boolean> }
  | { type: 'RESTORE'; payload: Partial<UiState> };

export const defaultUiState: UiState = {
  showSidebar: true,
  showDetailedFiles: true,
  showRightPanel: false, // Hidden by default as part of v1 regression fix
  showDots: false,
  showMeta: true,
  showTouchstoneControls: false,
  showMarkers: true,
  showMarkerTools: true,
  showPaneTools: true,
  showSearchTools: true,
  showLineTools: true,
  showViewTools: true,
  theme: 'dark',
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
  traceHueSlots: {},
  huePalette: 'standard',
  traceInterpolations: {},
  vis: {},
  selectedTraceName: null,
  paneAssignmentWarning: null,
  activeWizard: null,
};

export type ThemePreference = 'system' | 'light' | 'dark';
const THEME_KEY = 'mergen-theme-preference';
const ThemeContext = createContext<{ preference: ThemePreference; setPreference: (value: ThemePreference) => void } | null>(null);

export const UiStateContext = createContext<UiState | null>(null);
export const UiDispatchContext = createContext<React.Dispatch<UiAction> | null>(null);

export function readThemePreference(): ThemePreference {
  try { const value = localStorage.getItem(THEME_KEY); return value === 'light' || value === 'dark' ? value : 'system'; } catch { return 'system'; }
}

export function getInitialUiState(preference: ThemePreference): UiState {
  const systemDark = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return { ...defaultUiState, huePalette: readAppPreferences().palette, theme: preference === 'system' ? (systemDark ? 'dark' : 'light') : preference };
}

export function uiReducer(state: UiState, action: UiAction): UiState {
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
      return { ...defaultUiState, ...action.payload, theme: state.theme, huePalette: state.huePalette };
    }
    default:
      return state;
  }
}

export function UiStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(uiReducer, readThemePreference(), getInitialUiState);
  return <UiStoreAdapter state={state} dispatch={dispatch}>{children}</UiStoreAdapter>;
}

/** Connect the shared workspace state to the browser-only theme preference. */
export function UiStoreAdapter({ children, state, dispatch }: { children: React.ReactNode; state: UiState; dispatch: React.Dispatch<UiAction> }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readThemePreference);
  const setPreference = useCallback((value: ThemePreference) => {
    setPreferenceState(value);
    try { if (value === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, value); } catch { /* storage may be unavailable */ }
  }, []);
  useEffect(() => {
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const sync = () => dispatch({ type: 'SET', payload: { key: 'theme', value: preference === 'system' ? (media?.matches ? 'dark' : 'light') : preference } });
    sync();
    if (preference !== 'system' || !media) return;
    if (typeof media.addEventListener === 'function') { media.addEventListener('change', sync); return () => media.removeEventListener('change', sync); }
    media.addListener(sync); return () => media.removeListener(sync);
  }, [preference, dispatch]);
  useLayoutEffect(() => {
    document.documentElement.classList.remove('theme-dark', 'theme-light', 'theme-glass');
    document.documentElement.classList.add(`theme-${state.theme === 'glass' ? 'dark' : state.theme}`);
  }, [state.theme]);

  return (
    <ThemeContext.Provider value={{ preference, setPreference }}>
    <UiDispatchContext.Provider value={dispatch}>
      <UiStateContext.Provider value={state}>
        {children}
      </UiStateContext.Provider>
    </UiDispatchContext.Provider>
    </ThemeContext.Provider>
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

export function useThemePreference() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useThemePreference must be used within a UiStoreProvider');
  return context;
}
