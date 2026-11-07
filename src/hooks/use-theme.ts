import { useState, useEffect, useCallback } from 'react';
import { useUiState, useThemePreference } from '../stores/ui-store';
import type { ThemeColors } from '../types/theme';

/**
 * Hook for managing application theme and reading CSS color tokens.
 * Ported from app-controller.js.
 */
export function useTheme() {
  const { theme } = useUiState();
  const { preference, setPreference } = useThemePreference();
  const [colors, setColors] = useState<ThemeColors | null>(null);

  /** Read current color tokens from the computed styles of document.documentElement. */
  const readColors = useCallback(() => {
    const s = getComputedStyle(document.documentElement);
    const get = (v: string) => s.getPropertyValue(v).trim();

    const themeColors: ThemeColors = {
      tr: [get('--tr0'), get('--tr1'), get('--tr2'), get('--tr3'), get('--tr4'), get('--tr5')],
      dr: [get('--dr0'), get('--dr1'), get('--dr2'), get('--dr3'), get('--dr4'), get('--dr5')],
      mn: get('--mn'),
      md: get('--md'),
      mp: get('--mp'),
      accent: get('--accent'),
      muted: get('--muted'),
      dim: get('--dim'),
      text: get('--text'),
      bg: get('--bg'),
      card: get('--card'),
      border: get('--border'),
      tipBg: get('--tipBg'),
      tipBd: get('--tipBd'),
      grid: get('--grid'),
      dAlt: get('--dAlt'),
      dAmp: get('--dAmp'),
      noiseTr: get('--noiseTr'),
      ip3C: get('--ip3C'),
      refV: get('--refV'),
      refH: get('--refH'),
      cross: get('--cross'),
    };
    setColors(themeColors);
  }, []);

  useEffect(() => {
    readColors();
  }, [theme, readColors]);

  return {
    theme: theme === 'glass' ? 'dark' : theme,
    preference,
    setTheme: setPreference,
    colors,
    refreshColors: readColors
  };
}
