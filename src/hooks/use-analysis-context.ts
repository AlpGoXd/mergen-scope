import { useMemo } from 'react';
import { useAnalysisTarget } from './use-analysis-target';
import { useTraceColors } from './use-trace-colors';
import { useMarkerState } from '../stores/marker-store';
import { usePaneState } from '../stores/pane-store';
import { useRefLineState } from '../stores/ref-line-store';
import { useTraceState } from '../stores/trace-store';
import type { AnalysisInputs } from '../types/registry-contract';
import type { Trace } from '../types/trace';
import { defaultTraceForPane } from '../domain/default-trace';
import { paneRangesOf } from '../domain/analysis/instances';
import { useUiState } from '../stores/ui-store';

/** Everything an analysis card needs from the stores, in one place. Cards stay presentational. */
export function useAnalysisContext() {
  const { allTraces, allKnownTraces, vis } = useTraceState();
  const { markers } = useMarkerState();
  const { refLines, paneViews } = useRefLineState();
  const { panes, activePaneId, tracePaneMap } = usePaneState();
  const resolveTraceColor = useTraceColors();
  const { target } = useAnalysisTarget();
  const { selectedTraceName } = useUiState();

  const visibleTraces = useMemo(() => allTraces.filter(trace => vis[trace.name] !== false), [allTraces, vis]);
  const view = activePaneId ? paneViews[activePaneId] : undefined;
  const visibleRange = view?.x ? { left: view.x[0], right: view.x[1] } : null;
  // Every pane's range, so Waveform and FFT read the view of the pane that shows their source.
  const paneRanges = useMemo(() => paneRangesOf(paneViews), [paneViews]);

  const inputs = useMemo<AnalysisInputs>(() => ({
    traces: allKnownTraces, markers, visibleRange, paneRanges, lines: refLines, tracePaneMap, vis, touchstone: target.touchstone ?? null,
  }), [allKnownTraces, markers, visibleRange?.left, visibleRange?.right, paneRanges, refLines, tracePaneMap, vis, target.touchstone]);

  // The trace a new analysis starts on: the selected or active one, else the first visible trace of the active pane, else any visible trace.
  const targetTrace = useMemo<Trace | null>(() => {
    return defaultTraceForPane(allTraces, selectedTraceName, activePaneId, tracePaneMap, vis);
  }, [allTraces, selectedTraceName, activePaneId, tracePaneMap, vis]);

  const traceById = useMemo(() => new Map<string, Trace>(allKnownTraces.map(trace => [trace.id, trace])), [allKnownTraces]);
  return { inputs, targetTrace, allKnownTraces, visibleTraces, traceById, panes, activePaneId, tracePaneMap, refLines, resolveTraceColor, target, markers };
}
