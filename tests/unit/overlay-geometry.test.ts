import { describe, expect, it } from 'vitest';
import { overlayGeometry, shapeGeometry } from '../../src/domain/analysis/overlay-geometry';

const plot = { left: 0, top: 0, width: 10, height: 10 };
const scale = (n: number) => n;

describe('analysis overlay geometry', () => {
  it('clips bands and rejects out-of-plot shapes', () => {
    expect(shapeGeometry({ kind: 'band', x1: -2, x2: 4 }, scale, scale, plot)).toEqual({ kind: 'band', x: 0, y: 0, width: 4, height: 10 });
    expect(shapeGeometry({ kind: 'band', x1: 2, x2: 8, y1: 9, y2: 3 }, scale, scale, plot)).toEqual({ kind: 'band', x: 2, y: 3, width: 6, height: 6 });
    expect(shapeGeometry({ kind: 'triangle', x: 5, y: 5, n: 1 }, scale, scale, plot)).toEqual({ kind: 'triangle', x: 5, y: 5, n: 1 });
    expect(shapeGeometry({ kind: 'dot', x: 11, y: 5 }, scale, scale, plot)).toBeNull();
    expect(shapeGeometry({ kind: 'tick', x: 2, y: 3 }, scale, scale, plot)).toEqual({ kind: 'tick', x: 2, y: 3 });
  });
  it('scales and clips polyline segments to the plot', () => {
    expect(overlayGeometry('polyline', [{ x: -2, y: 5 }, { x: 5, y: 5 }, { x: 12, y: 5 }], scale, scale, plot)).toBe('M 0 5 L 5 5 M 5 5 L 10 5');
  });
  it('does not bridge invalid points or draw outside segments', () => {
    const points = [{ x: 1, y: 1 }, { x: NaN, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 4 }, { x: 20, y: 20 }, { x: 30, y: 30 }];
    expect(overlayGeometry('polyline', points, scale, scale, plot)).toBe('M 3 3 L 4 4 M 4 4 L 10 10');
  });
  it('scales a bandwidth segment and its clipped end ticks', () => {
    expect(overlayGeometry('segment', [{ x: 1, y: 1 }, { x: 4, y: 1 }], n => n * 2, n => n * 5, plot)).toBe('M 2 5 L 8 5 M 2 1 L 2 9 M 8 1 L 8 9');
    expect(overlayGeometry('segment', [{ x: -2, y: 5 }, { x: 5, y: 5 }], scale, scale, plot)).toBe('M 0 5 L 5 5 M 5 1 L 5 9');
  });
  it('ignores non-finite scale results and invalid plot rectangles', () => {
    expect(overlayGeometry('polyline', [{ x: 0, y: 0 }, { x: 1, y: 1 }], () => Infinity, scale, plot)).toBe('');
    expect(overlayGeometry('polyline', [{ x: 0, y: 0 }, { x: 1, y: 1 }], scale, scale, { ...plot, width: 0 })).toBe('');
  });
});
