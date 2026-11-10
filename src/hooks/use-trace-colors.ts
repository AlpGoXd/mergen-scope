import { useMemo } from 'react';
import { makeTraceColorResolver } from '../domain/trace-colors';
import { useTraceState } from '../stores/trace-store';
import { useUiState } from '../stores/ui-store';
import { useTheme } from './use-theme';

export function useTraceColors() {
  const { allKnownTraces } = useTraceState();
  const { traceColors, traceHueSlots, huePalette } = useUiState();
  const { theme } = useTheme();
  return useMemo(() => makeTraceColorResolver(allKnownTraces, traceColors, theme, traceHueSlots, huePalette), [allKnownTraces, theme, traceColors, traceHueSlots, huePalette]);
}
