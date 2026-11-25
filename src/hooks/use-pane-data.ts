import { useMemo, useRef } from 'react';
import { useTraceState } from '../stores/trace-store';
import type { Trace } from '../types/trace';

/** The pane's visible traces at full resolution: markers, readouts, analysis and exports read these. */
export function usePaneTraces(traceNames: string[]) {
  const { allTraces, vis } = useTraceState();
  const prevTracesRef = useRef<Trace[]>([]);
  return useMemo(() => {
    const next = allTraces.filter(t => traceNames.includes(t.name) && vis[t.name]);
    const prev = prevTracesRef.current;
    if (next.length === prev.length && next.every((trace, index) => trace === prev[index])) {
      return prev;
    }
    prevTracesRef.current = next;
    return next;
  }, [allTraces, traceNames, vis]);
}
