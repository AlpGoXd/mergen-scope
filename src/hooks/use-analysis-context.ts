import { useMemo } from 'react';
import { useAnalysisTarget } from './use-analysis-target';
import { useTheme } from './use-theme';
import { makeTraceColorResolver } from '../domain/trace-colors';
import { useMarkerState } from '../stores/marker-store';
import { usePaneState } from '../stores/pane-store';
import { useRefLineState } from '../stores/ref-line-store';
import { useTraceState } from '../stores/trace-store';
import { useUiState } from '../stores/ui-store';
import type { AnalysisInputs } from '../types/registry-contract';
import type { Trace } from '../types/trace';

/** Everything an analysis card needs from the stores, in one place. Cards stay presentational. */
export function useAnalysisContext() {
  const { allKnownTraces, vis } = useTraceState();
  const { markers } = useMarkerState();
  const { refLines, paneViews } = useRefLineState();
  const { panes, activePaneId, tracePaneMap } = usePaneState();
  const { traceColors } = useUiState();
  const { colors, theme } = useTheme();
  const resolveTraceColor = useMemo(() => {
    const styles = getComputedStyle(document.documentElement);
    const sourcePalette = Array.from({ length: 8 }, (_, index) => styles.getPropertyValue(`--tr${index}`).trim());
    const derivedPalette = Array.from({ length: 8 }, (_, index) => styles.getPropertyValue(`--dr${index}`).trim());
    return makeTraceColorResolver(allKnownTraces, sourcePalette, derivedPalette, traceColors, theme);
  }, [allKnownTraces, colors, theme, traceColors]);
  const { target } = useAnalysisTarget();

  const visibleTraces = useMemo(() => allKnownTraces.filter(trace => vis[trace.name] !== false), [allKnownTraces, vis]);
  const view = activePaneId ? paneViews[activePaneId] : undefined;
  const visibleRange = view?.x ? { left: view.x[0], right: view.x[1] } : null;

  const inputs = useMemo<AnalysisInputs>(() => ({
    traces: allKnownTraces, markers, visibleRange, lines: refLines, tracePaneMap, vis, touchstone: target.touchstone ?? null,
  }), [allKnownTraces, markers, visibleRange?.left, visibleRange?.right, refLines, tracePaneMap, vis, target.touchstone]);

  // The trace a new analysis starts on: the selected or active one, else the first visible trace of the active pane, else any visible trace.
  const targetTrace = useMemo<Trace | null>(() => {
    if (target.trace) return target.trace;
    const inPane = visibleTraces.find(trace => activePaneId !== null && tracePaneMap[trace.name]?.includes(activePaneId));
    return inPane ?? visibleTraces[0] ?? null;
  }, [target.trace, visibleTraces, activePaneId, tracePaneMap]);

  const traceById = useMemo(() => new Map<string, Trace>(allKnownTraces.map(trace => [trace.id, trace])), [allKnownTraces]);
  return { inputs, targetTrace, allKnownTraces, visibleTraces, traceById, panes, activePaneId, tracePaneMap, refLines, resolveTraceColor, target, markers };
}
