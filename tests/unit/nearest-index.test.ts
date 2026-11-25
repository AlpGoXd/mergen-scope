import { describe, expect, it } from 'vitest';
import { computeBandwidth } from '../../src/domain/analysis/bandwidth';
import { countInXRange, isAscendingX } from '../../src/domain/trace-math';
import { nearestIndexByFreq } from '../../src/domain/markers';
import type { DataPoint } from '../../src/types/trace';

/** The original implementation: first index at the smallest distance. */
function linearNearest(data: readonly DataPoint[], freq: number): number {
  const first = data[0];
  if (!first || !Number.isFinite(freq)) return -1;
  let best = 0;
  let bestDf = Math.abs(first.freq - freq);
  for (let i = 1; i < data.length; i++) {
    const point = data[i];
    if (!point) continue;
    const df = Math.abs(point.freq - freq);
    if (df < bestDf) { bestDf = df; best = i; }
  }
  return best;
}

/** Deterministic generator so a failure reproduces. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const pts = (xs: number[]): DataPoint[] => xs.map((freq, i) => ({ freq, amp: i }));

describe('nearestIndexByFreq', () => {
  it('matches the linear scan on random ascending data with duplicates and exact ties', () => {
    const random = rng(7);
    for (let round = 0; round < 300; round++) {
      const length = 1 + Math.floor(random() * 60);
      // A small integer grid makes duplicates and exact midpoints frequent.
      const xs = Array.from({ length }, () => Math.floor(random() * 40)).sort((a, b) => a - b);
      const data = pts(xs);
      expect(isAscendingX(data)).toBe(true);
      for (let probe = -3; probe <= 44; probe += 0.5) {
        expect(nearestIndexByFreq(data, probe), `${xs.join(',')} @ ${probe}`).toBe(linearNearest(data, probe));
      }
    }
  });

  it('matches the linear scan on random real-valued ascending data', () => {
    const random = rng(11);
    for (let round = 0; round < 100; round++) {
      let x = random() * 1e6;
      const data = pts(Array.from({ length: 200 }, () => (x += random() * 1e3)));
      for (let probe = 0; probe < 300; probe++) {
        const freq = data[0]!.freq - 2000 + random() * (data[199]!.freq - data[0]!.freq + 4000);
        expect(nearestIndexByFreq(data, freq)).toBe(linearNearest(data, freq));
      }
    }
  });

  it('breaks ties toward the lower index, including inside a run of duplicate x', () => {
    expect(nearestIndexByFreq(pts([0, 2, 2, 2, 4]), 3)).toBe(1);
    expect(nearestIndexByFreq(pts([0, 2, 2, 2, 4]), 2)).toBe(1);
    expect(nearestIndexByFreq(pts([1, 3]), 2)).toBe(0);
    expect(nearestIndexByFreq(pts([5, 5, 5]), 5)).toBe(0);
  });

  it('takes the first of several samples that are equally far after rounding', () => {
    // 1 - (-1e-30) and 1 - (-2e-30) both round to exactly 1, so the linear scan keeps the earlier one.
    const data = pts([-2e-30, -1e-30]);
    expect(linearNearest(data, 1)).toBe(0);
    expect(nearestIndexByFreq(data, 1)).toBe(0);
  });

  it('handles the ends, a single sample and a probe far outside', () => {
    const data = pts([10, 20, 30]);
    expect(nearestIndexByFreq(data, -1e9)).toBe(0);
    expect(nearestIndexByFreq(data, 1e9)).toBe(2);
    expect(nearestIndexByFreq(data, 10)).toBe(0);
    expect(nearestIndexByFreq(data, 30)).toBe(2);
    expect(nearestIndexByFreq(pts([7]), 100)).toBe(0);
  });

  it('returns -1 for no data or a non-finite probe, like before', () => {
    expect(nearestIndexByFreq([], 1)).toBe(-1);
    expect(nearestIndexByFreq(pts([1, 2]), NaN)).toBe(-1);
    expect(nearestIndexByFreq(pts([1, 2]), Infinity)).toBe(-1);
  });

  it('falls back to the linear scan when x is not ascending', () => {
    const random = rng(3);
    for (let round = 0; round < 200; round++) {
      const data = pts(Array.from({ length: 1 + Math.floor(random() * 30) }, () => Math.floor(random() * 20)));
      for (let probe = -2; probe <= 22; probe += 0.5) {
        expect(nearestIndexByFreq(data, probe)).toBe(linearNearest(data, probe));
      }
    }
    // A closed loop, as a polar or Smith trace can have: x goes up then down.
    const loop = pts([0, 1, 2, 3, 2, 1, 0.5]);
    expect(isAscendingX(loop)).toBe(false);
    expect(nearestIndexByFreq(loop, 0.4)).toBe(linearNearest(loop, 0.4));
    expect(nearestIndexByFreq(loop, 2)).toBe(2);
  });

  it('falls back when a sample has a non-finite x', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const data = pts([1, 2, bad, 4]);
      expect(isAscendingX(data)).toBe(false);
      for (let probe = 0; probe <= 5; probe += 0.5) {
        expect(nearestIndexByFreq(data, probe)).toBe(linearNearest(data, probe));
      }
    }
  });

  it('is exact on a million samples without scanning them per call', () => {
    const data = Array.from({ length: 1_000_000 }, (_, i): DataPoint => ({ freq: i * 0.5, amp: 0 }));
    expect(nearestIndexByFreq(data, 123_456.3)).toBe(246_913);
    expect(nearestIndexByFreq(data, 123_456.25)).toBe(246_912);
    const start = performance.now();
    for (let i = 0; i < 20_000; i++) nearestIndexByFreq(data, i * 20);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it('gives bandwidth analysis the same reference point as before', () => {
    const data = Array.from({ length: 101 }, (_, i): DataPoint => ({ freq: i, amp: -Math.abs(i - 50) }));
    const result = computeBandwidth(data, 50.2, 0, 3);
    expect(result?.bandwidth).toBeCloseTo(6, 6);
  });
});

describe('countInXRange', () => {
  it('counts like a filter on ascending and non-ascending data', () => {
    const random = rng(5);
    for (let round = 0; round < 100; round++) {
      const ascending = round % 2 === 0;
      const xs = Array.from({ length: 50 }, () => Math.floor(random() * 30));
      const data = pts(ascending ? xs.sort((a, b) => a - b) : xs);
      for (const [left, right] of [[3, 12], [0, 29], [-5, -1], [30, 40], [8, 8], [12, 3], [NaN, 5]] as const) {
        expect(countInXRange(data, left, right)).toBe(data.filter(p => p.freq >= left && p.freq <= right).length);
      }
    }
  });
});
