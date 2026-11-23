import { DEFAULT_APP_SIZE, normalizeAppSize } from './app-size';
import type { AppSize } from './app-size';
import type { SymbolSetting } from '../../domain/trace-palette';

export const appNeutrals = ['slate', 'stone', 'zinc', 'ocean', 'moss', 'purple', 'pink', 'ember'] as const;
type AppNeutral = (typeof appNeutrals)[number];

/** Display names for each neutral tint; stored ids stay stable for existing preferences. */
export const appNeutralLabels: Readonly<Record<AppNeutral, string>> = {
  slate: 'Storm',
  stone: 'Sand',
  zinc: 'Mist',
  ocean: 'Ocean',
  moss: 'Moss',
  purple: 'Amethyst',
  pink: 'Sakura',
  ember: 'Ember',
};

export type AppPreferences = {
  size: AppSize;
  neutral: AppNeutral;
  palette: 'standard' | 'colour-blind';
  traceSymbols: SymbolSetting;
  contrast: 'normal' | 'high';
};

export const defaultAppPreferences: AppPreferences = {
  size: DEFAULT_APP_SIZE,
  neutral: 'slate',
  palette: 'standard',
  traceSymbols: 'repeat',
  contrast: 'normal',
};

export const appPreferencesKey = 'mergen-app-preferences';

export function readAppPreferences(): AppPreferences {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(appPreferencesKey) ?? '{}');
    if (typeof raw !== 'object' || raw === null) return defaultAppPreferences;
    const v = raw as Partial<AppPreferences>;
    return {
      size: normalizeAppSize(v.size),
      neutral: appNeutrals.find(neutral => neutral === v.neutral) ?? defaultAppPreferences.neutral,
      palette: v.palette === 'colour-blind' ? v.palette : 'standard',
      traceSymbols: v.traceSymbols === 'off' || v.traceSymbols === 'always' ? v.traceSymbols : 'repeat',
      contrast: v.contrast === 'high' ? 'high' : 'normal',
    };
  } catch {
    return defaultAppPreferences;
  }
}

export function applyAppAppearance({ neutral, contrast }: AppPreferences): void {
  document.documentElement.dataset.neutral = neutral;
  document.documentElement.dataset.contrast = contrast;
}
