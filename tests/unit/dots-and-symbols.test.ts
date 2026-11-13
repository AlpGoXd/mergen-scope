import { expect, it } from 'vitest';
import { planDotsAndSymbols } from '../../src/domain/dots-and-symbols';

const points = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 100, y: 0 }, { x: 180, y: 0 }, { x: NaN, y: 1 }];
it('draws all finite dots without symbols and no dots when disabled', () => {
  expect(planDotsAndSymbols({ points, showDots: true, showSymbols: false }).dots).toEqual([0, 1, 2, 3]);
  expect(planDotsAndSymbols({ points, showDots: false, showSymbols: true }).dots).toEqual([]);
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
