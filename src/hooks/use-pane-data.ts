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

    const upsertRow = (freq: number, traceName: string, amp: number) => {
      let row = freqMap.get(freq);
      if (!row) {
        row = { freq, fs: freq };
      }
      freqMap.set(freq, { ...row, [traceName]: amp });
    };

    paneTraces.forEach(tr => {
      tr.data.forEach(pt => {
        if (xRange && (pt.freq < xRange.left || pt.freq > xRange.right)) return;

        upsertRow(pt.freq, tr.name, pt.amp);
      });

      if (!xRange || tr.data.length < 2) return;

      let leftBefore: typeof tr.data[number] | null = null;
      let leftAfter: typeof tr.data[number] | null = null;
      let rightBefore: typeof tr.data[number] | null = null;
      let rightAfter: typeof tr.data[number] | null = null;

      for (let i = 0; i < tr.data.length; i += 1) {
        const pt = tr.data[i];
        if (!pt) continue;
        if (pt.freq < xRange.left) {
          leftBefore = pt;
          continue;
        }
        leftAfter = pt;
        break;
      }

      for (let i = 0; i < tr.data.length; i += 1) {
        const pt = tr.data[i];
        if (!pt) continue;
        if (pt.freq <= xRange.right) {
          rightBefore = pt;
          continue;
        }
        rightAfter = pt;
        break;
      }

      const interpolateAmp = (
        start: typeof tr.data[number],
        end: typeof tr.data[number],
        targetFreq: number,
      ) => {
        const span = end.freq - start.freq;
        if (!Number.isFinite(span) || span === 0) return null;
        const ratio = (targetFreq - start.freq) / span;
        const amp = start.amp + (end.amp - start.amp) * ratio;
        return Number.isFinite(amp) ? amp : null;
      };

      if (
        leftBefore &&
        leftAfter &&
        leftBefore.freq < xRange.left &&
        leftAfter.freq > xRange.left
      ) {
        const amp = interpolateAmp(leftBefore, leftAfter, xRange.left);
        if (amp != null) upsertRow(xRange.left, tr.name, amp);
      }

      if (
        rightBefore &&
        rightAfter &&
        rightBefore.freq < xRange.right &&
        rightAfter.freq > xRange.right
      ) {
        const amp = interpolateAmp(rightBefore, rightAfter, xRange.right);
        if (amp != null) upsertRow(xRange.right, tr.name, amp);
      }
    });

    return Array.from(freqMap.values()).sort((a, b) => a.freq - b.freq);
  }, [paneTraces, xRange]);

  return {
    paneTraces,
    mergedData
  };
}
