import { expect, it } from 'vitest';
import { planDotsAndSymbols, sampleDotsVisible, visibleSampleCount } from '../../src/domain/dots-and-symbols';

it('allows dots at 3 px per sample gap and hides them below that spacing', () => {
  expect(sampleDotsVisible(11, 30)).toBe(true);
  expect(sampleDotsVisible(11, 29.99)).toBe(false);
  expect(sampleDotsVisible(12, 30)).toBe(false);
  expect(sampleDotsVisible(11, 20, 2)).toBe(true);
});

it('allows a lone visible sample and requires a nonempty plot', () => {
  expect(sampleDotsVisible(1, 2)).toBe(true);
  expect(sampleDotsVisible(0, 800)).toBe(false);
  expect(sampleDotsVisible(1, 0)).toBe(false);
  expect(sampleDotsVisible(400, Infinity)).toBe(false);
});

it('counts only measured samples within the inclusive visible range', () => {
  const samples = [0, 4, 8, 12].map(freq => ({ freq, amp: 0 }));
  expect(visibleSampleCount(samples, [4, 8])).toBe(2);
  expect(visibleSampleCount(samples, [4.01, 12])).toBe(2);
  expect(visibleSampleCount(samples, [5, 7])).toBe(0);
  expect(visibleSampleCount(samples, [13, 20])).toBe(0);
  expect(visibleSampleCount(samples, [-8, -1])).toBe(0);
  expect(visibleSampleCount(samples.slice(0, 1), [0, 1])).toBe(1);
  expect(visibleSampleCount([], [0, 10])).toBe(0);
  expect(visibleSampleCount(samples, null)).toBe(0);
  expect(visibleSampleCount(samples, [NaN, 10])).toBe(0);
  expect(visibleSampleCount(samples, [8, 4])).toBe(0);
});

const points = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 100, y: 0 }, { x: 180, y: 0 }, { x: NaN, y: 1 }];
it('draws all finite dots without symbols and no dots when disabled', () => {
  expect(planDotsAndSymbols({ points, showDots: true, showSymbols: false }).dots).toEqual([0, 1, 2, 3]);
  expect(planDotsAndSymbols({ points, showDots: false, showSymbols: true }).dots).toEqual([]);
});
it('only plans as many symbols as there are samples to associate with them', () => {
  const plan = planDotsAndSymbols({ points: [{ x: 0, y: 0 }, { x: 400, y: 0 }], showDots: false, showSymbols: true });
  expect(plan.symbols.map(symbol => symbol.x)).toEqual([45, 135]);
});
it('keeps every dot and snaps distinct hollow symbols to samples', () => {
  const samples = Array.from({ length: 21 }, (_, i) => ({ x: i * 25, y: 0 }));
  for (const showDots of [true, false]) {
    const plan = planDotsAndSymbols({ points: samples, showDots, showSymbols: true });
    expect(plan.hollow).toBe(showDots);
    expect(plan.dots).toHaveLength(showDots ? samples.length : 0);
    if (showDots) expect(plan.dots).toEqual(samples.map((_, index) => index));
    expect(plan.symbols.length).toBeGreaterThan(1);
    expect(new Set(plan.symbols.map(symbol => symbol.sampleIndex)).size).toBe(plan.symbols.length);
    if (showDots) for (const symbol of plan.symbols) expect({ x: symbol.x, y: symbol.y }).toEqual(samples[symbol.sampleIndex]);
    for (let i = 1; i < plan.symbols.length; i++) {
      const previous = plan.symbols[i - 1]; const current = plan.symbols[i];
      if (previous && current) expect(current.x - previous.x).toBeGreaterThanOrEqual(65);
      if (previous && current) expect(current.x - previous.x).toBeLessThanOrEqual(115);
    }
  }
});
