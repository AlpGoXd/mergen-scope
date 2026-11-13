import { describe, expect, it } from 'vitest';
import { resolveValue, resolveComplex } from '../../src/domain/interpolation';

describe('left panel interpolation', () => {
  const scalar = [{ freq: 0, amp: 0 }, { freq: 1, amp: 1 }, { freq: 2, amp: 4 }, { freq: 3, amp: 9 }];
  const complex = scalar.map(p => ({ x: p.freq, re: p.amp, im: p.amp * 2 }));
  it('retains legacy snap and gives exact, nearest, hold and auto distinct behavior', () => {
    expect(resolveValue(scalar, 1.7, 'snap', true)).toEqual({ x: 2, y: 4 });
    expect(resolveValue(scalar, 1.7, 'exact', true)).toEqual({ x: 2, y: 4 });
    expect(resolveValue(scalar, 1.7, 'nearest', true)).toEqual({ x: 1.7, y: 4 });
    expect(resolveValue(scalar, 1.7, 'previous', true)).toEqual({ x: 1.7, y: 1 });
    expect(resolveValue(scalar, 1.7, 'next', true)).toEqual({ x: 1.7, y: 4 });
    expect(resolveValue(scalar, 1.5, 'auto', true)).toEqual({ x: 1.5, y: 2.5 });
  });
  it('falls back locally for duplicate x values in scalar and complex samples', () => {
    const values = [{ freq: 0, amp: 0 }, { freq: 1, amp: 1 }, { freq: 1, amp: 2 }, { freq: 2, amp: 4 }, { freq: 3, amp: 9 }];
    expect(resolveValue(values, 2.5, 'cubic', false).y).toBe(6.5);
    const result = resolveComplex(values.map(p => ({ x: p.freq, re: p.amp, im: 2 * p.amp })), 2.5, 'cubic', false);
    expect(result.re).toBe(6.5);
    expect(result.im).toBe(13);
  });
  it('uses the same natural cubic spline for scalar and complex components', () => {
    const value = resolveValue(scalar, 1.5, 'cubic', true);
    const z = resolveComplex(complex, 1.5, 'cubic', true);
    expect(value.y).toBeCloseTo(2.2);
    expect(z.re).toBeCloseTo(value.y);
    expect(z.im).toBeCloseTo(value.y * 2);
    expect(resolveValue(scalar, 1, 'cubic', true)).toEqual({ x: 1, y: 1 });
  });
});
