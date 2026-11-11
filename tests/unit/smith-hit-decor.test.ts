import { describe, expect, it } from 'vitest';
import { samplesPath, splitByBand } from '../../src/domain/smith/band.ts';
import { frequencyAtPoint, gammaAtFrequency, nearestSample, nearestTracePoint } from '../../src/domain/smith/hit.ts';
import { directionChevrons, traceEnds } from '../../src/domain/smith/trace-decor.ts';
import type { SmithSample, SmithViewport } from '../../src/types/smith-plot.ts';

// 400 × 400 px, 200 px per unit Γ: Γ = −0.5, 0, 0.5 land at x = 100, 200, 300 on y = 200.
const viewport: SmithViewport = { width: 400, height: 400, center: { re: 0, im: 0 }, scale: 200 };
const line: SmithSample[] = [
  { frequencyHz: 1e9, gamma: { re: -0.5, im: 0 } },
  { frequencyHz: 2e9, gamma: { re: 0, im: 0 } },
  { frequencyHz: 3e9, gamma: { re: 0.5, im: 0 } },
];
const upper: SmithSample[] = [
  { frequencyHz: 5e9, gamma: { re: -0.5, im: 0.5 } },
  { frequencyHz: 6e9, gamma: { re: 0.5, im: 0.5 } },
];
const traces = [{ traceId: 'a', samples: line }, { traceId: 'b', samples: upper }];

describe('Smith hit testing', () => {
  it('returns the nearest measured sample and its frequency', () => {
    const hit = nearestSample(traces, { x: 240, y: 190 }, viewport);
    expect(hit?.traceId).toBe('a');
    expect(hit?.frequencyHz).toBe(2e9);
    expect(hit?.sampleIndex).toBe(1);
    expect(hit?.distancePx).toBeCloseTo(Math.hypot(40, 10), 9);
    expect(nearestSample(traces, { x: 290, y: 110 }, viewport)?.frequencyHz).toBe(6e9);
    expect(nearestSample(traces, { x: 240, y: 190 }, viewport, 20)).toBeNull();
    expect(nearestSample([], { x: 0, y: 0 }, viewport)).toBeNull();
  });

  it('returns the nearest point on the drawn line with the frequency there', () => {
    const hit = nearestTracePoint(traces, { x: 240, y: 190 }, viewport);
    expect(hit?.traceId).toBe('a');
    expect(hit?.point.x).toBeCloseTo(240, 9);
    expect(hit?.point.y).toBeCloseTo(200, 9);
    expect(hit?.distancePx).toBeCloseTo(10, 9);
    expect(hit?.frequencyHz).toBeCloseTo(2.4e9, 3);
    expect(hit?.gamma.re).toBeCloseTo(0.2, 12);
    expect(hit?.sampleIndex).toBe(1);
    // Past the end of a trace the hit stays on its last sample.
    const end = nearestTracePoint([{ traceId: 'a', samples: line }], { x: 380, y: 200 }, viewport);
    expect(end?.frequencyHz).toBe(3e9);
    expect(end?.distancePx).toBeCloseTo(80, 9);
    expect(nearestTracePoint(traces, { x: 240, y: 190 }, viewport, 5)).toBeNull();
    expect(frequencyAtPoint(upper, { x: 150, y: 100 }, viewport)).toBeCloseTo(5.25e9, 3);
    expect(frequencyAtPoint([], { x: 150, y: 100 }, viewport)).toBeNull();
  });

  it('skips non-finite samples without joining across them', () => {
    const broken: SmithSample[] = [line[0]!, { frequencyHz: 1.5e9, gamma: { re: Number.NaN, im: 0 } }, line[2]!];
    // No segment bridges the gap, so the middle of the screen is 100 px from either end.
    const hit = nearestTracePoint([{ traceId: 'a', samples: broken }], { x: 200, y: 200 }, viewport);
    expect(hit?.distancePx).toBeCloseTo(100, 9);
    expect(samplesPath(broken)).toBe('M-0.5,0M0.5,0');
    expect(gammaAtFrequency(broken, 2e9)).toBeNull();
    expect(splitByBand(broken)).toHaveLength(2);
    expect(nearestTracePoint([{ traceId: 'a', samples: broken }], { x: 200, y: 200 }, viewport, 10)).toBeNull();
    expect(nearestSample([{ traceId: 'a', samples: broken }], { x: 200, y: 200 }, viewport, 10)).toBeNull();
    expect(frequencyAtPoint(broken, { x: 200, y: 200 }, viewport)).not.toBe(2e9);
    expect(directionChevrons(broken, viewport)).toEqual([]);
  });

  it('finds Γ at a frequency for markers, without extrapolating', () => {
    expect(gammaAtFrequency(line, 2e9)).toEqual({ re: 0, im: 0 });
    expect(gammaAtFrequency(line, 2.5e9)?.re).toBeCloseTo(0.25, 12);
    expect(gammaAtFrequency([...line].reverse(), 1.5e9)?.re).toBeCloseTo(-0.25, 12);
    expect(gammaAtFrequency(line, 0.5e9)).toBeNull();
    expect(gammaAtFrequency(line, 3.5e9)).toBeNull();
    expect(gammaAtFrequency(line, Number.NaN)).toBeNull();
  });
});

describe('Smith trace decoration', () => {
  it('draws four chevrons, one every fifth of the on-screen length, pointing to higher frequency', () => {
    const chevrons = directionChevrons(line, viewport);
    expect(chevrons.map(c => Math.round(c.x))).toEqual([140, 180, 220, 260]);
    for (const chevron of chevrons) { expect(chevron.y).toBeCloseTo(200, 9); expect(chevron.angleDeg).toBeCloseTo(0, 9); }
    expect(chevrons[0]?.frequencyHz).toBeCloseTo(1.4e9, 3);
    // The same trace stored from high to low frequency still points toward higher frequency.
    const reversed = directionChevrons([...line].reverse(), viewport);
    expect(reversed).toHaveLength(4);
    for (const chevron of reversed) expect(Math.abs(chevron.angleDeg)).toBeCloseTo(0, 9);
    // A trace running right to left as frequency rises points left.
    const leftward = directionChevrons(line.map(s => ({ frequencyHz: s.frequencyHz, gamma: { re: -s.gamma.re, im: 0 } })), viewport);
    for (const chevron of leftward) expect(Math.abs(chevron.angleDeg)).toBeCloseTo(180, 9);
    // Upward on screen (+imaginary) is −90°.
    const up = directionChevrons([{ frequencyHz: 1, gamma: { re: 0, im: -0.5 } }, { frequencyHz: 2, gamma: { re: 0, im: 0.5 } }], viewport);
    expect(up[0]?.angleDeg).toBeCloseTo(-90, 9);
  });

  it('uses fewer chevrons on a short trace and only counts what is on screen', () => {
    const short = line.map(s => ({ frequencyHz: s.frequencyHz, gamma: { re: s.gamma.re * 0.2, im: 0 } }));
    expect(directionChevrons(short, viewport)).toHaveLength(1);
    expect(directionChevrons(short.map(s => ({ ...s, gamma: { re: s.gamma.re * 0.1, im: 0 } })), viewport)).toHaveLength(0);
    expect(directionChevrons(line, viewport, 0)).toHaveLength(0);
    // Zoomed in on the right half: every chevron is inside the view.
    const zoomed: SmithViewport = { ...viewport, center: { re: 0.5, im: 0 }, scale: 800 };
    const visible = directionChevrons(line, zoomed);
    expect(visible.length).toBeGreaterThan(0);
    for (const chevron of visible) { expect(chevron.x).toBeGreaterThanOrEqual(0); expect(chevron.x).toBeLessThanOrEqual(400); }
  });

  it('reports the start (lowest) and end (highest) frequency samples', () => {
    expect(traceEnds(line)).toEqual({ start: line[0], end: line[2] });
    expect(traceEnds([...line].reverse())).toEqual({ start: line[0], end: line[2] });
    expect(traceEnds([])).toBeNull();
    expect(traceEnds([{ frequencyHz: 1, gamma: { re: Number.NaN, im: 0 } }])).toBeNull();
  });
});

describe('Smith band split for a linked Hz pane', () => {
  it('is one full-colour run without a band', () => {
    expect(splitByBand(line)).toEqual([{ inBand: true, samples: line }]);
    expect(splitByBand(line, null)).toHaveLength(1);
  });

  it('cuts the trace exactly at the band edges and shares the edge points', () => {
    const runs = splitByBand(line, { minHz: 1.5e9, maxHz: 2.5e9 });
    expect(runs.map(run => run.inBand)).toEqual([false, true, false]);
    expect(runs[0]?.samples.map(s => s.frequencyHz)).toEqual([1e9, 1.5e9]);
    expect(runs[1]?.samples.map(s => s.frequencyHz)).toEqual([1.5e9, 2e9, 2.5e9]);
    expect(runs[2]?.samples.map(s => s.frequencyHz)).toEqual([2.5e9, 3e9]);
    expect(runs[0]?.samples[1]?.gamma.re).toBeCloseTo(-0.25, 12);
    expect(runs[1]?.samples[2]?.gamma.re).toBeCloseTo(0.25, 12);
    expect(samplesPath(runs[1]?.samples ?? [])).toBe('M-0.25,0L0,0L0.25,0');
  });

  it('handles a band inside one segment, a band covering everything, and one that misses', () => {
    const inside = splitByBand(line, { minHz: 1.2e9, maxHz: 1.4e9 });
    expect(inside.map(run => run.inBand)).toEqual([false, true, false]);
    expect(inside[1]?.samples.map(s => s.frequencyHz)).toEqual([1.2e9, 1.4e9]);
    expect(splitByBand(line, { minHz: 0, maxHz: 10e9 })).toEqual([{ inBand: true, samples: line }]);
    expect(splitByBand(line, { minHz: 4e9, maxHz: 5e9 }).map(run => run.inBand)).toEqual([false]);
    // A descending sweep gives the same pieces in its own order.
    const descending = splitByBand([...line].reverse(), { minHz: 1.5e9, maxHz: 2.5e9 });
    expect(descending.map(run => run.inBand)).toEqual([false, true, false]);
    expect(descending[1]?.samples.map(s => s.frequencyHz)).toEqual([2.5e9, 2e9, 1.5e9]);
    // An invalid band is ignored.
    expect(splitByBand(line, { minHz: 3e9, maxHz: 1e9 })).toHaveLength(1);
  });
});
