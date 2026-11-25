import { describe, expect, it } from 'vitest';
import { chartAxisData, logXReason } from '../../src/domain/chart/axis-scale';
import { placeMarker, nearestIndexByFreq } from '../../src/domain/markers';
import { ampRangeInX, mergePaneData, paneExtent, plotBuckets, PLOT_BUCKETS } from '../../src/domain/pane-data';
import { decimateMinMax } from '../../src/domain/trace-math';
import { computeBandwidth } from '../../src/domain/analysis/bandwidth';
import type { MergedPaneRow } from '../../src/domain/pane-data';
import type { DataPoint } from '../../src/types/trace';
import { makeTestTrace } from './helpers';

const wave = (length: number, step = 1, offset = 0): DataPoint[] =>
  Array.from({ length }, (_, i) => ({ freq: offset + i * step, amp: Math.sin(i / 37) + 0.3 * Math.sin(i / 3.1) }));

const minOf = (values: readonly number[]): number => values.reduce((m, v) => (v < m ? v : m), Infinity);
const maxOf = (values: readonly number[]): number => values.reduce((m, v) => (v > m ? v : m), -Infinity);

const column = (rows: readonly MergedPaneRow[], name: string): number[] => rows.flatMap(row => {
  const value = row[name];
  return value === undefined ? [] : [value];
});

describe('decimateMinMax gaps', () => {
  const big = (mutate: (data: DataPoint[]) => void): DataPoint[] => {
    const data = wave(20_000);
    mutate(data);
    return data;
  };

  it('keeps a single-sample spike in either direction', () => {
    const data = big(d => { d[12_345] = { freq: 12_345, amp: 50 }; d[7_001] = { freq: 7_001, amp: -50 }; });
    const out = decimateMinMax(data, 0, 19_999, 100);
    expect(out).toContain(data[12_345]);
    expect(out).toContain(data[7_001]);
    expect(out.length).toBeLessThanOrEqual(2 * 100 + 4);
  });

  it('never lets a NaN sample win a bucket, and keeps the first NaN of a run so the line breaks', () => {
    const data = big(d => {
      for (const i of [1000, 1001, 1002]) d[i] = { freq: i, amp: NaN };
      d[5000] = { freq: 5000, amp: 9 };
    });
    const out = decimateMinMax(data, 0, 19_999, 100);
    expect(out).toContain(data[5000]);
    expect(out).toContain(data[1000]);
    expect(out).not.toContain(data[1001]);
    // The bucket that holds the NaN run still has real extremes.
    const bucket = out.filter(p => p.freq >= 1000 - 199 && p.freq < 1000 + 1 && !Number.isNaN(p.amp));
    expect(bucket.length).toBeGreaterThan(0);
  });

  it('a NaN at the start of a bucket does not hide the rest of that bucket', () => {
    const data = wave(20_000);
    data[200] = { freq: 200, amp: NaN }; // first sample of bucket 1 of 100 (200 samples each)
    data[250] = { freq: 250, amp: 99 };
    expect(decimateMinMax(data, 0, 19_999, 100)).toContain(data[250]);
  });

  it('treats samples the predicate rejects as gaps that stay out of the extremes', () => {
    const data = wave(20_000).map((p, i) => ({ freq: p.freq, amp: i % 400 === 0 ? -5 : 1 + Math.abs(p.amp) }));
    const out = decimateMinMax(data, 0, 19_999, 100, p => p.amp > 0);
    const positive = out.filter(p => p.amp > 0);
    // The positive extremes of the full data survive.
    expect(minOf(positive.map(p => p.amp))).toBeCloseTo(minOf(data.filter(p => p.amp > 0).map(p => p.amp)), 12);
    expect(maxOf(positive.map(p => p.amp))).toBeCloseTo(maxOf(data.filter(p => p.amp > 0).map(p => p.amp)), 12);
    expect(out.some(p => p.amp < 0)).toBe(true); // the gap marker is kept
  });

  it('is unchanged for finite data without a predicate', () => {
    const data = wave(5_000);
    const out = decimateMinMax(data, 0, 4_999, 50);
    const withAlwaysTrue = decimateMinMax(data, 0, 4_999, 50, () => true);
    expect(withAlwaysTrue).toEqual(out);
  });
});

describe('mergePaneData drawing series', () => {
  it('leaves traces with fewer than two points per column untouched', () => {
    const traces = [{ name: 'a', data: wave(2 * PLOT_BUCKETS) }];
    const plot = mergePaneData(traces, null, true);
    expect(plot).toHaveLength(2 * PLOT_BUCKETS);
    expect(column(plot, 'a')).toEqual(traces[0]!.data.map(p => p.amp));
  });

  it('thins a dense trace to about two points per column and keeps its extremes, first and last', () => {
    const data = wave(1_000_000, 0.001);
    data[654_321] = { freq: 654.321, amp: 40 };
    data[111_111] = { freq: 111.111, amp: -40 };
    const plot = mergePaneData([{ name: 'a', data }], null, true);
    expect(plot.length).toBeLessThanOrEqual(2 * PLOT_BUCKETS + 4);
    expect(plot.length).toBeGreaterThan(PLOT_BUCKETS);
    const amps = column(plot, 'a');
    expect(maxOf(amps)).toBe(40);
    expect(minOf(amps)).toBe(-40);
    expect(plot[0]?.freq).toBe(data[0]?.freq);
    expect(plot.at(-1)?.freq).toBe(data.at(-1)?.freq);
    expect(plot.every((row, i) => i === 0 || row.freq > (plot[i - 1]?.freq ?? Infinity))).toBe(true);
  });

  it('computes the series for the visible range, so zooming in shows full detail', () => {
    const data = wave(1_000_000, 0.001);
    const range = { left: 100, right: 100.5 }; // 500 samples: fewer than two per column
    const plot = mergePaneData([{ name: 'a', data }], range, true);
    const inRange = data.filter(p => p.freq >= range.left && p.freq <= range.right);
    for (const point of inRange) expect(plot.some(row => row.freq === point.freq && row['a'] === point.amp)).toBe(true);
    expect(plot.every(row => row.freq >= range.left && row.freq <= range.right)).toBe(true);
    // A wide range is thinned again, from the original data.
    expect(mergePaneData([{ name: 'a', data }], { left: 0, right: 900 }, true).length).toBeLessThanOrEqual(2 * PLOT_BUCKETS + 6);
  });

  it('thins every trace of different lengths and grids in one pane', () => {
    const traces = [
      { name: 'long', data: wave(300_000, 1) },
      { name: 'short', data: wave(500, 600, 0.5) },
      { name: 'mid', data: wave(50_000, 6, 0.25) },
    ];
    traces[0]!.data[200_000] = { freq: 200_000, amp: 30 };
    const plot = mergePaneData(traces, null, true);
    expect(column(plot, 'short')).toHaveLength(500);
    expect(maxOf(column(plot, 'long'))).toBe(30);
    expect(column(plot, 'mid').length).toBeLessThanOrEqual(2 * PLOT_BUCKETS + 4);
    expect(column(plot, 'long').length).toBeLessThanOrEqual(2 * PLOT_BUCKETS + 4);
    for (const trace of traces) {
      expect(minOf(column(plot, trace.name))).toBe(minOf(trace.data.map(p => p.amp)));
      expect(maxOf(column(plot, trace.name))).toBe(maxOf(trace.data.map(p => p.amp)));
    }
  });

  it('keeps the break between sweep bands of a multiband trace', () => {
    const low = wave(100_000, 1);
    const high = wave(100_000, 1, 10_000_000);
    const trace = { name: 'a', data: [...low, ...high], parameters: { sweepFormat: 'multiband' } };
    const plot = mergePaneData([trace], null, true);
    const xs = plot.map(row => row.freq);
    expect(xs.some(x => x <= 99_999)).toBe(true);
    expect(xs.some(x => x >= 10_000_000)).toBe(true);
    expect(xs.some(x => x > 99_999 && x < 10_000_000)).toBe(false);
  });

  it('follows the plot width: about one column per pixel, in coarse steps', () => {
    expect(plotBuckets(undefined)).toBe(PLOT_BUCKETS);
    expect(plotBuckets(0)).toBe(PLOT_BUCKETS);
    expect(plotBuckets(NaN)).toBe(PLOT_BUCKETS);
    expect(plotBuckets(900)).toBe(PLOT_BUCKETS);
    expect(plotBuckets(1_200)).toBe(PLOT_BUCKETS);
    expect(plotBuckets(1_201)).toBeGreaterThanOrEqual(1_201);
    expect(plotBuckets(3_700)).toBeGreaterThanOrEqual(3_700);
    expect(plotBuckets(3_700)).toBeLessThan(3_700 + 600);
    const data = wave(400_000);
    const wide = mergePaneData([{ name: 'a', data }], null, true, { buckets: plotBuckets(3_000) });
    expect(wide.length).toBeGreaterThan(2 * PLOT_BUCKETS);
    expect(wide.length).toBeLessThanOrEqual(2 * plotBuckets(3_000) + 4);
  });
});

describe('log axes', () => {
  const log = { x: 'linear', y: 'log', phase: 'wrapped' } as const;

  it('thins on a log Y axis, keeps the positive extremes and a gap at every non-positive run', () => {
    const data = Array.from({ length: 200_000 }, (_, i): DataPoint => ({ freq: i + 1, amp: 2 + Math.sin(i / 50) }));
    data[50_000] = { freq: 50_001, amp: 500 };
    data[90_000] = { freq: 90_001, amp: 0.01 };
    for (const i of [120_000, 120_001, 120_002]) data[i] = { freq: i + 1, amp: -4 };
    const trace = makeTestTrace({ name: 't', data, units: { x: 'Hz', y: 'V' }, family: 'waveform' });
    const result = chartAxisData([trace], log, null, PLOT_BUCKETS);
    const rows = result.byTrace.get('t') ?? [];
    expect(rows.length).toBeLessThanOrEqual(2 * PLOT_BUCKETS + 40);
    const values = column(rows, 't');
    expect(maxOf(values)).toBe(500);
    expect(minOf(values)).toBe(0.01);
    expect(values.every(v => v > 0)).toBe(true);
    // The non-positive run is a row with no value, so the line breaks there.
    const gaps = rows.filter(row => row['t'] === undefined);
    expect(gaps.some(row => row.freq >= 120_001 && row.freq <= 120_003)).toBe(true);
    expect(result.logYFit).toEqual({ min: 0.01, max: 500 });
    expect(result.omitted).toBe(3);
  });

  it('draws log X with log Y from the same positive samples', () => {
    const data = Array.from({ length: 100_000 }, (_, i): DataPoint => ({ freq: i + 1, amp: 1 + (i % 1000) / 10 }));
    const trace = makeTestTrace({ name: 't', data, units: { x: 'Hz', y: 'V' }, family: 'waveform' });
    const result = chartAxisData([trace], { x: 'log', y: 'log', phase: 'wrapped' }, null);
    const values = column(result.byTrace.get('t') ?? [], 't');
    expect(minOf(values)).toBe(1);
    expect(maxOf(values)).toBeCloseTo(100.9, 9);
  });

  it('reports non-positive x from the cached bounds, as before', () => {
    expect(logXReason([makeTestTrace()])).toBe('X has values ≤ 0');
    expect(logXReason([makeTestTrace({ data: [{ freq: 1, amp: 1 }, { freq: 2, amp: 2 }] })])).toBeUndefined();
  });
});

describe('paneExtent and ampRangeInX', () => {
  /** What the pane used to learn from the full merged rows. */
  function fromRows(traces: Array<{ name: string; data: DataPoint[] }>, range: { left: number; right: number } | null) {
    const rows = mergePaneData(traces, range, false);
    let lo = Infinity, hi = -Infinity;
    for (const row of rows) for (const trace of traces) {
      const v = row[trace.name];
      if (v !== undefined && Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    }
    return { rows, lo, hi };
  }

  it('matches the merged rows for the full range, a zoom, a zoom between samples and an empty zoom', () => {
    const traces = [
      { name: 'a', data: wave(20_000, 0.5) },
      { name: 'b', data: wave(300, 31, 3.3) },
    ];
    for (const range of [null, { left: 1_000, right: 4_000 }, { left: 2.1, right: 2.3 }, { left: 40_000, right: 50_000 }, { left: -50, right: 5 }]) {
      const { rows, lo, hi } = fromRows(traces, range);
      const extent = paneExtent(traces, range);
      if (rows.length === 0) { expect(extent).toBeNull(); continue; }
      expect(extent?.xMin).toBe(rows[0]?.fs);
      expect(extent?.xMax).toBe(rows.at(-1)?.fs);
      expect(extent?.y?.min).toBe(lo);
      expect(extent?.y?.max).toBe(hi);
    }
  });

  it('returns null without traces or data, and ignores non-finite amplitudes for y', () => {
    expect(paneExtent([], null)).toBeNull();
    expect(paneExtent([{ name: 'a', data: [] }], null)).toBeNull();
    const extent = paneExtent([{ name: 'a', data: [{ freq: 1, amp: NaN }, { freq: 2, amp: 3 }, { freq: 3, amp: -Infinity }] }], null);
    expect(extent?.y).toEqual({ min: 3, max: 3 });
    expect(paneExtent([{ name: 'a', data: [{ freq: 1, amp: NaN }] }], null)?.y).toBeNull();
  });

  it('handles an unsorted trace when nothing is zoomed, like the merge did', () => {
    const data: DataPoint[] = [{ freq: 5, amp: 1 }, { freq: 1, amp: 2 }, { freq: 3, amp: -4 }];
    const extent = paneExtent([{ name: 'a', data }], null);
    expect(extent).toEqual({ xMin: 1, xMax: 5, y: { min: -4, max: 2 } });
  });

  it('ampRangeInX covers the samples in the window only', () => {
    const data: DataPoint[] = [0, 1, 2, 3, 4, 5].map(i => ({ freq: i, amp: i === 0 ? 100 : i === 5 ? -100 : i }));
    expect(ampRangeInX([{ name: 'a', data }], 1, 4)).toEqual({ min: 1, max: 4 });
    expect(ampRangeInX([{ name: 'a', data }], 10, 20)).toBeNull();
  });
});

describe('measurements still see the full data when the drawn series is thinned', () => {
  const data = wave(400_000, 0.001);
  const trace = makeTestTrace({
    name: 'wave', data, units: { x: 's', y: 'V' }, family: 'waveform', domain: 'time', isUniform: true, interpolation: 'linear',
  });
  const plot = mergePaneData([trace], null, true);
  const drawn = new Set(plot.map(row => row.freq));

  it('the drawn series is a small subset and the trace is untouched', () => {
    expect(plot.length).toBeLessThan(data.length / 100);
    expect(trace.data).toBe(data);
    expect(trace.data).toHaveLength(400_000);
  });

  it('the hover readout and markers resolve against every sample, including ones that were not drawn', () => {
    const undrawn = data.filter(p => !drawn.has(p.freq));
    expect(undrawn.length).toBeGreaterThan(300_000);
    for (const index of [12_345, 99_999, 250_001, 399_998]) {
      const sample = data[index]!;
      expect(drawn.has(sample.freq)).toBe(false);
      expect(nearestIndexByFreq(trace.data, sample.freq + 1e-6)).toBe(index);
      const placement = placeMarker(trace, sample.freq);
      expect(placement.freq).toBe(sample.freq);
      expect(placement.amp).toBeCloseTo(sample.amp, 9);
      const snapped = placeMarker({ ...trace, interpolation: 'snap' }, sample.freq + 1e-4);
      expect(snapped.freq).toBe(sample.freq);
      expect(snapped.amp).toBe(sample.amp);
    }
  });

  it('analysis reads the same full data: a 3 dB bandwidth is identical with or without drawing the series', () => {
    const peak: DataPoint[] = Array.from({ length: 400_001 }, (_, i) => ({ freq: i, amp: -Math.abs(i - 200_000) / 1000 }));
    const before = computeBandwidth(peak, 200_000, 0, 3);
    mergePaneData([{ name: 'p', data: peak }], null, true);
    const after = computeBandwidth(peak, 200_000, 0, 3);
    expect(after).toEqual(before);
    expect(after?.bandwidth).toBeCloseTo(6000, 6);
  });
});
