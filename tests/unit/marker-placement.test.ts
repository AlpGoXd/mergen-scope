import { describe, expect, it } from 'vitest';
import {
  computeMarkerHitTolerance,
  computeNearestPixelDist,
  findMarkerHit,
  pickPlacementTraceIndex,
} from '../../src/domain/chart/marker-placement';

describe('marker hit tolerance', () => {
  const bounds = { min: 100, max: 1100 };

  it('uses a seven-pixel radius at full zoom', () => {
    expect(computeMarkerHitTolerance(500, 1000, bounds)).toBe(14);
    expect(computeMarkerHitTolerance(500, 1000, null)).toBe(14);
  });

  it('approaches a three-pixel radius at deep zoom', () => {
    expect(computeMarkerHitTolerance(500, 1, bounds)).toBeCloseTo(0.006008, 10);
  });

  it('uses 0.006 of the span for zero or non-finite width', () => {
    expect(computeMarkerHitTolerance(0, 1000, bounds)).toBe(6);
    expect(computeMarkerHitTolerance(NaN, 1000, bounds)).toBe(6);
  });

  it('floors the pixel-derived tolerance at one millionth of the visible span', () => {
    expect(computeMarkerHitTolerance(10_000_000, 1000, bounds)).toBe(0.001);
  });
});

describe('marker hit lookup', () => {
  const first = { marker: { freq: 96 }, index: 4 };
  const nearer = { marker: { freq: 101 }, index: 7 };

  it('returns the first hit even when a later marker is closer', () => {
    expect(findMarkerHit([first, nearer], 100, 5)).toBe(first);
    expect(findMarkerHit([nearer, first], 100, 5)).toBe(nearer);
  });

  it('excludes hits exactly at the tolerance and skips NaN frequencies', () => {
    const invalid = { marker: { freq: NaN }, index: 9 };
    expect(findMarkerHit([first, invalid, nearer], 100, 4)).toBe(nearer);
    expect(findMarkerHit([first, invalid, nearer], 100, 1)).toBeUndefined();
  });
});

describe('auto marker trace picking', () => {
  const ticks = [{ val: 0, clientY: 120 }, { val: 100, clientY: 20 }];
  const fallback = { top: 10, height: 140, traces: [], xZoom: null };

  it('picks the closest of three traces above, below, and between their Y positions', () => {
    const amps = [20, 50, 80];
    expect(pickPlacementTraceIndex(ticks, amps, 25, fallback)).toBe(2);
    expect(pickPlacementTraceIndex(ticks, amps, 115, fallback)).toBe(0);
    expect(pickPlacementTraceIndex(ticks, amps, 60, fallback)).toBe(1);
    expect(ticks[0]?.clientY).toBe(120);
  });

  it('keeps the first trace on a tie and returns the only trace when mapped', () => {
    expect(pickPlacementTraceIndex(ticks, [80, 40], 60, fallback)).toBe(0);
    expect(pickPlacementTraceIndex(ticks, [40], 60, fallback)).toBe(0);
  });

  it('extrapolates from the rendered tick positions outside the plot', () => {
    expect(pickPlacementTraceIndex(ticks, [100, 120], 0, fallback)).toBe(1);
    expect(pickPlacementTraceIndex(ticks, [0, -20], 140, fallback)).toBe(1);
  });

  it('treats separated ticks with equal values as a constant mapping', () => {
    const flatTicks = [{ val: 40, clientY: 20 }, { val: 40, clientY: 120 }];
    expect(pickPlacementTraceIndex(flatTicks, [80, 40], 25, fallback)).toBe(1);
    expect(pickPlacementTraceIndex(flatTicks, [80, 40], 115, fallback)).toBe(1);
  });

  it('uses finite samples inside the X window when ticks are missing', () => {
    const visibleSamples = {
      ...fallback,
      traces: [{ data: [{ freq: 0, amp: 1000 }, { freq: 1, amp: 10 }, { freq: 2, amp: 30 }, { freq: 2, amp: NaN }] }],
      xZoom: { left: 1, right: 2 },
    };
    expect(pickPlacementTraceIndex([], [100, 30], 20, visibleSamples)).toBe(1);
    expect(pickPlacementTraceIndex([], [30, 10], 120, visibleSamples)).toBe(1);
  });

  it('includes a lone tick in the fallback range and clamps outside the plot', () => {
    const sampleRange = { ...fallback, traces: [{ data: [{ freq: 100, amp: 20 }, { freq: 200, amp: 40 }] }] };
    expect(pickPlacementTraceIndex([{ val: 80, clientY: 20 }], [40, 80, 100], 0, sampleRange)).toBe(1);
  });

  it('defaults to a 0–1 range without ticks or finite samples', () => {
    expect(pickPlacementTraceIndex([], [0, 1], 20, fallback)).toBe(1);
    expect(pickPlacementTraceIndex([], [0, 1], 120, fallback)).toBe(0);
  });

  it('uses the tick value range when two tick positions coincide', () => {
    const coincidentTicks = [{ val: 0, clientY: 60 }, { val: 100, clientY: 60 }];
    expect(pickPlacementTraceIndex(coincidentTicks, [20, 80], 25, fallback)).toBe(1);
  });

  it('leaves the choice to the pane if both tick ranges collapse or plot height is zero', () => {
    const collapsedTicks = [{ val: 20, clientY: 60 }, { val: 20, clientY: 60 }];
    expect(pickPlacementTraceIndex(collapsedTicks, [20, 80], 25, fallback)).toBeNull();
    expect(pickPlacementTraceIndex([], [0, 1], 25, { ...fallback, height: 40 })).toBeNull();
  });

  it('skips NaN distances and uses the first trace if no comparison wins', () => {
    expect(pickPlacementTraceIndex(ticks, [NaN, 40], 60, fallback)).toBe(1);
    expect(pickPlacementTraceIndex(ticks, [NaN, NaN], 60, fallback)).toBe(0);
    expect(pickPlacementTraceIndex(ticks, [40, 60], NaN, fallback)).toBe(0);
  });
});

describe('nearest marker sample pixel distance', () => {
  const data = [{ freq: 100, amp: 0 }, { freq: 200, amp: 0 }] as const;

  it('measures distance to samples at both plot edges', () => {
    expect(computeNearestPixelDist(data, 100, 100, 200, 200)).toBe(0);
    expect(computeNearestPixelDist(data, 200, 100, 200, 200)).toBe(0);
    expect(computeNearestPixelDist(data, 105, 100, 200, 200)).toBe(10);
    expect(computeNearestPixelDist(data, 195, 100, 200, 200)).toBe(10);
  });

  it('includes samples just outside either plot edge without clamping', () => {
    expect(computeNearestPixelDist(data, 105, 105, 195, 180)).toBe(10);
    expect(computeNearestPixelDist(data, 195, 105, 195, 180)).toBe(10);
  });

  it('disables snapping below 20 pixels of average spacing', () => {
    const threeSamples = [data[0], { freq: 150, amp: 0 }, data[1]];
    expect(computeNearestPixelDist(threeSamples, 125, 100, 200, 39)).toBe(Infinity);
    expect(computeNearestPixelDist(threeSamples, 125, 100, 200, 40)).toBe(10);
  });

  it('preserves degenerate width, domain, and sample handling', () => {
    expect(computeNearestPixelDist(data, 105, 100, 200, 0)).toBe(Infinity);
    expect(computeNearestPixelDist(data, 105, 100, 100, 200)).toBe(Infinity);
    expect(computeNearestPixelDist([], 105, 100, 200, 200)).toBe(Infinity);
    expect(computeNearestPixelDist(data, NaN, 100, 200, 200)).toBe(Infinity);
    expect(computeNearestPixelDist(data, 105, 100, 200, NaN)).toBeNaN();
  });
});
