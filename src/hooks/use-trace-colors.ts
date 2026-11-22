import { useMemo } from 'react';
import { makeTraceColorResolver } from '../domain/trace-colors';
import { useTraceState } from '../stores/trace-store';
import { useUiState } from '../stores/ui-store';
import { useTheme } from './use-theme';
import type { Theme } from '../domain/trace-palette';

/** `themeOverride` resolves colours for another theme (image export); on screen it is omitted. */
export function useTraceColors(themeOverride?: Theme, paper = false) {
  const { allKnownTraces } = useTraceState();
  const { traceColors, traceHueSlots, huePalette } = useUiState();
  const { theme: appTheme } = useTheme();
  const theme = themeOverride ?? appTheme;
  return useMemo(() => {
    const resolve = makeTraceColorResolver(allKnownTraces, traceColors, theme, traceHueSlots, huePalette);
    return (trace: Parameters<typeof resolve>[0]) => {
      const color = resolve(trace);
      return paper && huePalette === 'standard' ? `oklch(from ${color} 0.50 c h)` : color;
    };
  }, [allKnownTraces, theme, traceColors, traceHueSlots, huePalette, paper]);
}
