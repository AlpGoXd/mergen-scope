import { useState, useLayoutEffect, useEffect, useCallback } from 'react';
import { useUiState, useUiDispatch } from '../stores/ui-store';
import type { ThemeColors } from '../types/theme';

/**
 * Hook for managing application theme and reading CSS color tokens.
 * Ported from app-controller.js.
 */
export function useTheme() {
  const { theme } = useUiState();
  const uiDispatch = useUiDispatch();
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

  // Update theme class and read colors on change
  useLayoutEffect(() => {
    document.documentElement.classList.remove('theme-dark', 'theme-light', 'theme-glass');
    document.documentElement.classList.add(`theme-${theme}`);
    
    // We wait a tick for transitions/styles to apply if needed, but useLayoutEffect is synchronous
    readColors();
    
    // Observer for dynamic changes (like system theme)
    const observer = new MutationObserver(readColors);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => observer.disconnect();
  }, [theme, readColors]);

  // Keep light/dark theme synchronized with browser preference.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    if (theme === 'glass') {
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncTheme = () => {
      const preferred = media.matches ? 'dark' : 'light';
      if (theme !== preferred) {
        uiDispatch({ type: 'SET', payload: { key: 'theme', value: preferred } });
      }
    };

    // Sync immediately on mount, then on browser/OS theme changes.
    syncTheme();

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', syncTheme);
      return () => media.removeEventListener('change', syncTheme);
    }

    media.addListener(syncTheme);
    return () => media.removeListener(syncTheme);
  }, [theme, uiDispatch]);

  const setTheme = useCallback((nextTheme: "dark" | "light" | "glass") => {
    uiDispatch({ type: 'SET', payload: { key: 'theme', value: nextTheme } });
  }, [uiDispatch]);

  return {
    theme,
    setTheme,
    colors,
    refreshColors: readColors
  };
}
