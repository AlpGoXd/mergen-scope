import { describe, expect, it } from 'vitest';
import { TRACE_SYMBOLS } from '../../src/domain/trace-palette';
import { isClosedSymbol, symbolPath, symbolPositions } from '../../src/domain/trace-symbols';

describe('trace symbols', () => {
  it('every symbol has path data starting with a move', () => {
    for (const k of TRACE_SYMBOLS) expect(symbolPath(k, 10, 10)).toMatch(/^M/);
  });
  it('plus and cross are open strokes, the rest closed outlines', () => {
    expect(isClosedSymbol('plus')).toBe(false);
    expect(isClosedSymbol('cross')).toBe(false);
    expect(isClosedSymbol('circle')).toBe(true);
  });
  it('places symbols every spacing px along the line, starting half a spacing in', () => {
    const line = [{ x: 0, y: 0 }, { x: 400, y: 0 }];
    expect(symbolPositions(line, 90).map((p) => p.x)).toEqual([45, 135, 225, 315]);
  });
  it('follows arc length on bends and skips gaps', () => {
    const bent = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 }];
    expect(symbolPositions(bent, 90)).toEqual([{ x: 45, y: 0 }]);
    const gap = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: Number.NaN, y: 0 }, { x: 200, y: 0 }, { x: 300, y: 0 }];
    expect(symbolPositions(gap, 90).length).toBe(2);
  });
});
