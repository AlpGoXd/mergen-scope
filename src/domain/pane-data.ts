import type { DataPoint } from '../types/trace';
import { traceBands } from './sweep-bands';
import { decimateMinMax, interpolatePointAtX, traceBound } from './trace-math';

type PaneTrace = { readonly name: string; readonly data: readonly DataPoint[] };
type Range = { readonly left: number; readonly right: number };
export type MergedPaneRow = { freq: number; fs: number } & Record<string, number>;

/** Pixel columns the drawn series keeps apart (two points each: that column's min and max) before the plot width is known. */
export const PLOT_BUCKETS = 1200;
const BUCKET_STEP = 600;

/** Drawing buckets for a plot of this width: about one per pixel column, in coarse steps so a resize rarely rebuilds the series. */
export function plotBuckets(plotWidthPx: number | undefined): number {
  if (plotWidthPx === undefined || !Number.isFinite(plotWidthPx) || plotWidthPx <= PLOT_BUCKETS) return PLOT_BUCKETS;
  return Math.ceil(plotWidthPx / BUCKET_STEP) * BUCKET_STEP;
}

export interface PlotThinning {
  /** Pixel columns to keep apart. Defaults to PLOT_BUCKETS. */
  readonly buckets?: number;
  /** Points this rejects (a value a log axis cannot show) never win a column's min or max, and the line still breaks there. */
  readonly plottable?: (point: DataPoint) => boolean;
}

/**
 * Merge trace samples, retaining the original interpolation behavior at range edges.
 * With `plot`, each trace is thinned for drawing only: the extremes of every pixel column in the range survive.
 * Markers, readouts, analysis and exports read `trace.data`, never these rows.
 */
export function mergePaneData(traces: readonly PaneTrace[], range: Range | null | undefined, plot: boolean, thinning: PlotThinning = {}): MergedPaneRow[] {
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
    for (const data of traceBands(trace)) {
      const first = data[0];
      const last = data[data.length - 1];
      if (!first || !last) continue;
      const start = range ? traceBound(data, range.left) : 0;
      const end = range ? traceBound(data, range.right, true) : data.length;
      const samples = plot
        ? decimateMinMax(data, range?.left ?? first.freq, range?.right ?? last.freq, thinning.buckets ?? PLOT_BUCKETS, thinning.plottable)
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
  }
  return Array.from(rows.values()).sort((a, b) => a.freq - b.freq);
}

export interface PaneExtent {
  readonly xMin: number;
  readonly xMax: number;
  /** Finite amplitudes only; null when there are none. */
  readonly y: { readonly min: number; readonly max: number } | null;
}

export interface DataBounds { xMin: number; xMax: number; yMin: number; yMax: number }
const boundsCache = new WeakMap<readonly DataPoint[], DataBounds>();

/** Smallest and largest x, and smallest and largest finite amplitude, of a data array. One pass, then cached. */
export function dataBounds(data: readonly DataPoint[]): DataBounds {
  const cached = boundsCache.get(data);
  if (cached) return cached;
  const bounds = { xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity };
  for (const point of data) {
    if (point.freq < bounds.xMin) bounds.xMin = point.freq;
    if (point.freq > bounds.xMax) bounds.xMax = point.freq;
    if (Number.isFinite(point.amp)) {
      if (point.amp < bounds.yMin) bounds.yMin = point.amp;
      if (point.amp > bounds.yMax) bounds.yMax = point.amp;
    }
  }
  boundsCache.set(data, bounds);
  return bounds;
}

/** Smallest and largest finite amplitude of the samples with x in [left, right]; null when there are none. */
export function ampRangeInX(traces: readonly PaneTrace[], left: number, right: number): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const trace of traces) {
    for (const data of traceBands(trace)) {
      for (let i = traceBound(data, left), end = traceBound(data, right, true); i < end; i += 1) {
        const amp = data[i]?.amp;
        if (amp === undefined || !Number.isFinite(amp)) continue;
        if (amp < min) min = amp;
        if (amp > max) max = amp;
      }
    }
  }
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

/**
 * What mergePaneData(traces, range, false) would span (its first and last x, its finite amplitude range) without building its rows.
 * Null when it would have no rows. A full-range answer costs one pass per data array, then is cached.
 */
export function paneExtent(traces: readonly PaneTrace[], range: Range | null | undefined): PaneExtent | null {
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  let rows = false;
  const addY = (amp: number) => {
    if (!Number.isFinite(amp)) return;
    if (amp < yMin) yMin = amp;
    if (amp > yMax) yMax = amp;
  };
  for (const trace of traces) {
    for (const data of traceBands(trace)) {
      if (!data.length) continue;
      if (!range) {
        const bounds = dataBounds(data);
        rows = true;
        xMin = Math.min(xMin, bounds.xMin);
        xMax = Math.max(xMax, bounds.xMax);
        yMin = Math.min(yMin, bounds.yMin);
        yMax = Math.max(yMax, bounds.yMax);
        continue;
      }
      const start = traceBound(data, range.left);
      const end = traceBound(data, range.right, true);
      for (let i = start; i < end; i += 1) {
        const point = data[i];
        if (!point) continue;
        rows = true;
        if (point.freq < xMin) xMin = point.freq;
        if (point.freq > xMax) xMax = point.freq;
        addY(point.amp);
      }
      for (const [edge, index] of [[range.left, start], [range.right, end]] as const) {
        const before = data[index - 1];
        const after = data[index];
        if (before && after && before.freq < edge && after.freq > edge) {
          const point = interpolatePointAtX(before, after, edge);
          if (!point) continue;
          rows = true;
          if (edge < xMin) xMin = edge;
          if (edge > xMax) xMax = edge;
          addY(point.amp);
        }
      }
    }
  }
  if (!rows) return null;
  return { xMin, xMax, y: Number.isFinite(yMin) && Number.isFinite(yMax) ? { min: yMin, max: yMax } : null };
}
