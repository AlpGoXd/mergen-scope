import { DEFAULT_APP_SIZE, normalizeAppSize } from './app-size';
import type { AppSize } from './app-size';
import type { SymbolSetting } from '../../domain/trace-palette';

type AppNeutral = 'slate' | 'stone' | 'zinc';

export type AppPreferences = {
  size: AppSize;
  neutral: AppNeutral;
  palette: 'standard' | 'colour-blind';
  traceSymbols: SymbolSetting;
  exportTheme: 'print' | 'dark' | 'app';
};

export const defaultAppPreferences: AppPreferences = {
  size: DEFAULT_APP_SIZE,
  neutral: 'slate',
  palette: 'standard',
  traceSymbols: 'repeat',
  exportTheme: 'print',
};

export const appPreferencesKey = 'mergen-app-preferences';

export function readAppPreferences(): AppPreferences {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(appPreferencesKey) ?? '{}');
    if (typeof raw !== 'object' || raw === null) return defaultAppPreferences;
    const v = raw as Partial<AppPreferences>;
    return {
      size: normalizeAppSize(v.size),
      neutral: v.neutral === 'stone' || v.neutral === 'zinc' ? v.neutral : defaultAppPreferences.neutral,
      palette: v.palette === 'colour-blind' ? v.palette : 'standard',
      traceSymbols: v.traceSymbols === 'off' || v.traceSymbols === 'always' ? v.traceSymbols : 'repeat',
      exportTheme: v.exportTheme === 'dark' || v.exportTheme === 'app' ? v.exportTheme : 'print',
    };
  } catch {
    return defaultAppPreferences;
  }
}

export function applyAppNeutral(neutral: AppNeutral): void {
  document.documentElement.dataset.neutral = neutral;
}
