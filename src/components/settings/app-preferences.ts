import { DEFAULT_APP_SIZE, normalizeAppSize } from './app-size';
import type { AppSize } from './app-size';
import type { SymbolSetting } from '../../domain/trace-palette';

export type AppPreferences = { size: AppSize; palette: 'standard' | 'colour-blind'; traceSymbols: SymbolSetting; exportTheme: 'print' | 'dark' | 'app' };
export const defaultAppPreferences: AppPreferences = { size: DEFAULT_APP_SIZE, palette: 'standard', traceSymbols: 'repeat', exportTheme: 'print' };
export const appPreferencesKey = 'mergen-app-preferences';
export function readAppPreferences(): AppPreferences {
  try { const raw: unknown = JSON.parse(localStorage.getItem(appPreferencesKey) ?? '{}'); if (typeof raw !== 'object' || raw === null) return defaultAppPreferences; const v = raw as Partial<AppPreferences>; return {
    size: normalizeAppSize(v.size), palette: v.palette === 'colour-blind' ? v.palette : 'standard', traceSymbols: v.traceSymbols === 'off' || v.traceSymbols === 'always' ? v.traceSymbols : 'repeat', exportTheme: v.exportTheme === 'dark' || v.exportTheme === 'app' ? v.exportTheme : 'print',
  }; } catch { return defaultAppPreferences; }
}
