import { expect, it } from 'vitest';
import { planDotsAndSymbols } from '../../src/domain/dots-and-symbols';

const points = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 100, y: 0 }, { x: 180, y: 0 }, { x: NaN, y: 1 }];
it('draws all finite dots without symbols and no dots when disabled', () => {
  expect(planDotsAndSymbols({ points, showDots: true, showSymbols: false }).dots).toEqual([0, 1, 2, 3]);
  expect(planDotsAndSymbols({ points, showDots: false, showSymbols: true }).dots).toEqual([]);
});
it('replaces each nearest sample once and retains symbol positions', () => {
  const plan = planDotsAndSymbols({ points, showDots: true, showSymbols: true });
  expect(plan.symbols.map(symbol => symbol.sampleIndex)).toEqual([1, 2]);
  expect(plan.symbols.map(symbol => symbol.x)).toEqual([45, 135]);
  expect(plan.dots).toEqual([0, 3]);
  expect(plan.dots.length).toBe(4 - plan.symbols.length);
  expect(plan.symbols.every(symbol => !plan.dots.includes(symbol.sampleIndex))).toBe(true);
});
it('assigns nearby symbols different samples', () => {
  const plan = planDotsAndSymbols({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }], showDots: true, showSymbols: true, spacing: 60 });
  expect(new Set(plan.symbols.map(symbol => symbol.sampleIndex)).size).toBe(plan.symbols.length);
});
