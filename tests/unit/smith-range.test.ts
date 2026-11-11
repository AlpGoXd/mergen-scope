import { describe, expect, it } from 'vitest';
import { clipTraceToRange, effectiveRange, fullRangeOf, rangeLabel, handleToHz, hzToHandle } from '../../src/domain/smith/range';
import { smithRangeModel } from '../../src/domain/smith-pane-model';
import { directionChevrons, traceEnds } from '../../src/domain/smith/trace-decor';
import { splitByBand } from '../../src/domain/smith/band';
import { nearestSample } from '../../src/domain/smith/hit';

const sample = (frequencyHz: number) => ({ frequencyHz, gamma: { re: frequencyHz, im: 0 } });

describe('Smith range', () => {
  it('interpolates both clipping edges', () => {
    const runs = clipTraceToRange([sample(0), sample(10)], { startHz: 2, stopHz: 8 });
    expect(runs.map(run => run.map(point => point.frequencyHz))).toEqual([[2, 8]]);
  });
  it('prefers linked to manual and full ranges', () => {
    const full = { startHz: 0, stopHz: 10 }, manual = { startHz: 1, stopHz: 9 }, linked = { startHz: 2, stopHz: 8 };
    expect(effectiveRange({ full, manual, linked })).toEqual(linked);
    expect(effectiveRange({ full, manual: null, linked: null })).toEqual(full);
    expect(fullRangeOf([{ samples: [sample(0), sample(10)] }])).toEqual(full);
  });
  it('clips each overlap and preserves gaps', () => {
    const clip = (values: number[], startHz: number, stopHz: number) => clipTraceToRange(values.map(sample), { startHz, stopHz }).map(run => run.map(point => point.frequencyHz));
    expect(clip([0, 5, 10], 2, 12)).toEqual([[2, 5, 10]]);
    expect(clip([0, 5, 10], -2, 8)).toEqual([[0, 5, 8]]);
    expect(clip([0, 10], 2, 8)).toEqual([[2, 8]]);
    expect(clip([0, 10], 11, 12)).toEqual([]);
    expect(clip([0, 5, 10], 0, 10)).toEqual([[0, 5, 10]]);
    expect(clip([], 0, 10)).toEqual([]);
    expect(clip([5], 0, 10)).toEqual([[5]]);
    expect(clip([0, 4, NaN, 6, 10], 2, 8)).toEqual([[2, 4], [6, 8]]);
  });
  it('includes touching edges, point ranges, and never crosses a gap', () => {
    const clip = (values: number[], startHz: number, stopHz: number) => clipTraceToRange(values.map(sample), { startHz, stopHz }).map(run => run.map(point => point.frequencyHz));
    expect(clip([0, 2], 2, 4)).toEqual([[2]]);
    expect(clip([4, 6], 2, 4)).toEqual([[4]]);
    expect(clip([0, 10], 5, 5)).toEqual([[5]]);
    expect(clip([0, 5, 10], 5, 5)).toEqual([[5]]);
    expect(clip([0, NaN, 10], 4, 6)).toEqual([]);
  });
  it('formats labels and maps handles', () => {
    expect(rangeLabel({ startHz: 4e9, stopHz: 5e9 }, { startHz: 0, stopHz: 6e9 })).toBe('4.000 → 5.000 GHz of 0–6 GHz');
    expect(rangeLabel({ startHz: 4e9, stopHz: 5e9 }, { startHz: 1e4, stopHz: 8.5e9 })).toBe('4.000 → 5.000 GHz of 10 kHz–8.5 GHz');
    expect(handleToHz(60, { left: 10, width: 100 }, { startHz: 0, stopHz: 10 })).toBe(5);
    expect(hzToHandle(5, { left: 10, width: 100 }, { startHz: 0, stopHz: 10 })).toBe(60);
  });
  it('uses in-band interpolated endpoints for faint trace decor', () => {
    const model = smithRangeModel([{ samples: [sample(0), sample(10)] }], { startHz: 2, stopHz: 8 }, null, 'faint');
    const samples = model.traces[0]?.samples ?? [];
    const visible = splitByBand(samples, model.band).filter(run => run.inBand).flatMap(run => run.samples);
    expect(traceEnds(visible)).toMatchObject({ start: sample(2), end: sample(8) });
    expect(visible.every(point => point.frequencyHz >= 2 && point.frequencyHz <= 8)).toBe(true);
    expect(splitByBand(samples, model.band).some(run => !run.inBand)).toBe(true);
    const line = [{ frequencyHz: 0, gamma: { re: -0.5, im: 0 } }, { frequencyHz: 10, gamma: { re: 0.5, im: 0 } }];
    const clipped = clipTraceToRange(line, { startHz: 2, stopHz: 8 });
    const chevrons = clipped.flatMap(run => directionChevrons(run, { width: 400, height: 400, center: { re: 0, im: 0 }, scale: 200 }));
    expect(chevrons.length).toBeGreaterThan(0);
    expect(chevrons.every(item => item.frequencyHz >= 2 && item.frequencyHz <= 8)).toBe(true);
  });
  it('keeps distinct zero-width intersections and deduplicates repeated touches', () => {
    const point = (frequencyHz: number, re: number) => ({ frequencyHz, gamma: { re, im: 0 } });
    const crossings = clipTraceToRange([point(0, 0), point(10, 1), point(0, 2)], { startHz: 5, stopHz: 5 });
    expect(crossings.map(run => run[0]?.gamma.re)).toEqual([0.5, 1.5]);
    const touches = clipTraceToRange([point(0, 0), point(5, 1), point(0, 0), point(5, 1)], { startHz: 5, stopHz: 5 });
    expect(touches).toHaveLength(1);
  });
  it('uses engineering scales beyond GHz', () => {
    for (const [value, label] of [[1e12, '1.000 THz'], [1.5e-3, '1.500 mHz'], [1e-6, '1.000 µHz'], [1e4, '10.000 kHz'], [8.5e9, '8.500 GHz']] as const) {
      expect(rangeLabel({ startHz: value, stopHz: value }, { startHz: 0, stopHz: value })).toContain(label);
    }
  });
  it('snaps near a clipped edge to a measured in-range sample in both modes', () => {
    const traces = [{ traceId: 'a', samples: [{ frequencyHz: 0, gamma: { re: -0.5, im: 0 } }, { frequencyHz: 5, gamma: { re: 0, im: 0 } }, { frequencyHz: 10, gamma: { re: 0.5, im: 0 } }] }];
    const range = { startHz: 2, stopHz: 8 };
    const viewport = { width: 400, height: 400, center: { re: 0, im: 0 }, scale: 200 };
    for (const outside of ['hidden', 'faint'] as const) {
      const model = smithRangeModel(traces, range, null, outside);
      const visible = model.traces.map(trace => ({ ...trace, samples: model.band ? trace.samples.filter(item => item.frequencyHz >= range.startHz && item.frequencyHz <= range.stopHz) : trace.samples }));
      expect(nearestSample(visible, { x: 140, y: 200 }, viewport)?.frequencyHz).toBe(5);
    }
  });
});
