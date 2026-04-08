import { useMemo } from 'react';
import { useTraceState } from '../stores/trace-store';

type MergedPaneRow = {
  readonly freq: number;
  readonly fs: number;
} & Record<string, number>;

/**
 * Hook for preparing trace data for Recharts consumption.
 * Merges multiple traces into a single array of objects sharing a common X-axis (frequency).
 * Implementation follows legacy getVisibleTraceData.
 */
export function usePaneData(traceNames: string[], xRange?: { left: number; right: number } | null) {
  const { allTraces, vis } = useTraceState();

  const paneTraces = useMemo(() => {
    return allTraces.filter(t => traceNames.includes(t.name) && vis[t.name]);
  }, [allTraces, traceNames, vis]);

  const mergedData = useMemo(() => {
    if (paneTraces.length === 0) return [];

    // Simple implementation: identify all unique frequencies across all traces in the pane.
    // Optimization: if frequencies match exactly, we can use a more efficient merge.
    const freqMap = new Map<number, MergedPaneRow>();

    paneTraces.forEach(tr => {
      tr.data.forEach(pt => {
        if (xRange && (pt.freq < xRange.left || pt.freq > xRange.right)) return;
        
        let row = freqMap.get(pt.freq);
        if (!row) {
          row = { freq: pt.freq, fs: pt.freq };
          freqMap.set(pt.freq, row);
        }
        row = { ...row, [tr.name]: pt.amp };
        freqMap.set(pt.freq, row);
      });
    });

    return Array.from(freqMap.values()).sort((a, b) => a.freq - b.freq);
  }, [paneTraces, xRange]);

  return {
    paneTraces,
    mergedData
  };
}
