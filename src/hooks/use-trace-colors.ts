import { useMemo } from 'react';
import { makeTraceColorResolver } from '../domain/trace-colors';
import { useTraceState } from '../stores/trace-store';
import { useUiState } from '../stores/ui-store';
import { useTheme } from './use-theme';
import type { Theme } from '../domain/trace-palette';

/** `themeOverride` resolves colours for another theme (image export); on screen it is omitted. */
export function useTraceColors(themeOverride?: Theme) {
  const { allKnownTraces } = useTraceState();
  const { traceColors, traceHueSlots, huePalette } = useUiState();
  const { theme: appTheme } = useTheme();
  const theme = themeOverride ?? appTheme;
  return useMemo(() => makeTraceColorResolver(allKnownTraces, traceColors, theme, traceHueSlots, huePalette), [allKnownTraces, theme, traceColors, traceHueSlots, huePalette]);
}
