import { useMemo, useRef } from 'react';
import { mergePaneData } from '../domain/pane-data';
import { useTraceState } from '../stores/trace-store';
import type { Trace } from '../types/trace';

/** Prepare full-resolution interaction data and bounded-size chart data. */
export function usePaneData(traceNames: string[], xRange?: { left: number; right: number } | null) {
  const { allTraces, vis } = useTraceState();
  const prevTracesRef = useRef<Trace[]>([]);
  const paneTraces = useMemo(() => {
    const next = allTraces.filter(t => traceNames.includes(t.name) && vis[t.name]);
    const prev = prevTracesRef.current;
    if (next.length === prev.length && next.every((trace, index) => trace === prev[index])) {
      return prev;
    }
    prevTracesRef.current = next;
    return next;
  }, [allTraces, traceNames, vis]);
  const left = xRange?.left;
  const right = xRange?.right;
  // Depend on the numbers because callers pass a fresh range object every render.
  const mergedData = useMemo(() => mergePaneData(paneTraces, left === undefined || right === undefined ? null : { left, right }, false), [paneTraces, left, right]);
  const plotData = useMemo(() => mergePaneData(paneTraces, left === undefined || right === undefined ? null : { left, right }, true), [paneTraces, left, right]);
  return { paneTraces, mergedData, plotData };
}
