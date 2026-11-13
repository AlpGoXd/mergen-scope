import type { DataPoint } from '../types/trace';
import { decimateMinMax, interpolatePointAtX, traceBound } from './trace-math';

type PaneTrace = { readonly name: string; readonly data: readonly DataPoint[] };
type Range = { readonly left: number; readonly right: number };
export type MergedPaneRow = { freq: number; fs: number } & Record<string, number>;

// shortcut: fixed bucket count, switch to the measured plot width if 4K-wide panes look jagged
const PLOT_BUCKETS = 1200;

/** Merge trace samples, retaining the original interpolation behavior at range edges. */
export function mergePaneData(traces: readonly PaneTrace[], range: Range | null | undefined, plot: boolean): MergedPaneRow[] {
  const rows = new Map<number, MergedPaneRow>();
  const upsert = (freq: number, name: string, amp: number) => {
    let row = rows.get(freq);
    if (!row) {
      row = { freq, fs: freq };
      rows.set(freq, row);
    }
    row[name] = amp;
  };
  for (const trace of traces) {
    const data = trace.data;
    const first = data[0];
    const last = data[data.length - 1];
    if (!first || !last) continue;
    const start = range ? traceBound(data, range.left) : 0;
    const end = range ? traceBound(data, range.right, true) : data.length;
    const samples = plot
      ? decimateMinMax(data, range?.left ?? first.freq, range?.right ?? last.freq, PLOT_BUCKETS)
      : data.slice(start, end);
    for (const point of samples) {
      if (range && (point.freq < range.left || point.freq > range.right)) continue;
      upsert(point.freq, trace.name, point.amp);
    }
    if (!range) continue;
    for (const [edge, index] of [[range.left, start], [range.right, end]] as const) {
      const before = data[index - 1];
      const after = data[index];
      if (before && after && before.freq < edge && after.freq > edge) {
        const point = interpolatePointAtX(before, after, edge);
        if (point) upsert(edge, trace.name, point.amp);
      }
    }
  }
  return Array.from(rows.values()).sort((a, b) => a.freq - b.freq);
}
