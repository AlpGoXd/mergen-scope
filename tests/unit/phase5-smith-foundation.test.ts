import { describe, expect, it } from 'vitest';
import { admittanceToGamma, gammaToAdmittance, gammaToImpedance, impedanceToGamma, passiveMetrics, portZ0, seriesEquivalent } from '../../src/domain/smith/numerics.ts';
import { fitViewport, gammaToPoint, panBy, pointToGamma, zoomAt } from '../../src/domain/smith/viewport.ts';

const complex = (result: ReturnType<typeof impedanceToGamma>, re: number, im: number) => {
  expect(result.kind).toBe('value');
  if (result.kind === 'value') { expect(result.value.re).toBeCloseTo(re, 12); expect(result.value.im).toBeCloseTo(im, 12); }
};
describe('Smith numerical foundation', () => {
  it('uses the selected port impedance and maps match, open and short', () => {
    expect(portZ0([50, 75], 1)).toEqual({ kind: 'value', value: 75 });
    expect(portZ0([50], 1)).toEqual({ kind: 'undefined', reason: 'invalid-z0' });
    complex(impedanceToGamma({ re: 75, im: 0 }, 75), 0, 0);
    complex(impedanceToGamma({ re: 75, im: 0 }, 50), 0.2, 0);
    complex(impedanceToGamma({ re: 0, im: 0 }, 50), -1, 0);
    complex(admittanceToGamma({ re: 0, im: 0 }, 50), 1, 0);
    expect(gammaToImpedance({ re: 1, im: 0 }, 50)).toEqual({ kind: 'undefined', reason: 'singular' });
    expect(gammaToAdmittance({ re: -1, im: 0 }, 50)).toEqual({ kind: 'undefined', reason: 'singular' });
  });
  it('maps inductive and capacitive values and independent Y equivalents', () => {
    complex(impedanceToGamma({ re: 50, im: 50 }, 50), 0.2, 0.4);
    complex(impedanceToGamma({ re: 50, im: -50 }, 50), 0.2, -0.4);
    complex(admittanceToGamma({ re: 0.01, im: -0.01 }, 50), 0.2, 0.4);
    complex(gammaToImpedance({ re: 0.2, im: 0.4 }, 50), 50, 50);
    complex(gammaToAdmittance({ re: 0.2, im: 0.4 }, 50), 0.01, -0.01);
    const l = seriesEquivalent({ re: 0.2, im: 0.4 }, 50, 1e9);
    const c = seriesEquivalent({ re: 0.2, im: -0.4 }, 50, 1e9);
    if (l.kind !== 'value' || c.kind !== 'value') throw new Error('expected L and C');
    expect(l.value.kind).toBe('L'); expect(l.value.value).toBeCloseTo  (50 / (2 * Math.PI * 1e9), 18);
    expect(c.value.kind).toBe('C'); expect(c.value.value).toBeCloseTo(1 / (2 * Math.PI * 1e9 * 50), 20);
  });
  it('reports passive, singular, active, DC, and nonfinite cases explicitly', () => {
    expect(passiveMetrics({ re: 0.5, im: 0 }).vswr).toEqual({ kind: 'value', value: 3 });
    const rl = passiveMetrics({ re: 0.5, im: 0 }).returnLossDb;
    if (rl.kind !== 'value') throw new Error('expected RL');
    expect(rl.value).toBeCloseTo(6.020599913, 8);
    expect(passiveMetrics({ re: 0, im: 0 }).returnLossDb).toEqual({ kind: 'undefined', reason: 'singular' });
    expect(passiveMetrics({ re: 1, im: 0 }).vswr).toEqual({ kind: 'undefined', reason: 'singular' });
    expect(passiveMetrics({ re: 2, im: 0 }).returnLossDb).toEqual({ kind: 'undefined', reason: 'active' });
    expect(seriesEquivalent({ re: 0, im: 0 }, 50, 0)).toEqual({ kind: 'undefined', reason: 'dc' });
    expect(seriesEquivalent({ re: 2, im: 0 }, 50, 1)).toEqual({ kind: 'undefined', reason: 'active' });
    expect(impedanceToGamma({ re: NaN, im: 0 }, 50)).toEqual({ kind: 'undefined', reason: 'nonfinite' });
    expect(impedanceToGamma({ re: -50, im: 0 }, 50)).toEqual({ kind: 'undefined', reason: 'singular' });
  });
  it('preserves a lossless reactance near the unit circle and very high frequency results', () => {
    const g = impedanceToGamma({ re: 0, im: 0.005 }, 50);
    if (g.kind !== 'value') throw new Error('expected gamma');
    const l = seriesEquivalent(g.value, 50, 1e9);
    expect(l).toEqual({ kind: 'undefined', reason: 'ambiguous-boundary' });
    expect(seriesEquivalent({ re: 0, im: 1 + Number.EPSILON }, 50, 1e9)).toEqual({ kind: 'undefined', reason: 'ambiguous-boundary' });
    expect(passiveMetrics({ re: 1, im: 0 }).returnLossDb).toEqual({ kind: 'value', value: -0 });
    const tinyL = seriesEquivalent({ re: 0.2, im: 0.4 }, 2e-323, 1e-300);
    if (tinyL.kind !== 'value') throw new Error('expected tiny reference inductance');
    expect(tinyL.value.value / (2e-323 / 1e-300 / (2 * Math.PI))).toBeCloseTo(1, 10);
    const hugeL = seriesEquivalent({ re: 0.2, im: 0.4 }, 1e308, 0.5);
    if (hugeL.kind !== 'value') throw new Error('expected large inductance');
    expect(hugeL.value.value / (1e308 / Math.PI)).toBeCloseTo(1, 12);
    const hugeC = seriesEquivalent({ re: 0.2, im: -0.4 }, 1e300, 1e-310);
    if (hugeC.kind !== 'value') throw new Error('expected large capacitance');
    expect(hugeC.value.value / (1 / (2 * Math.PI * 1e-310 * 1e300))).toBeCloseTo(1, 10);
    expect(seriesEquivalent({ re: 1.000001, im: 0 }, 50, 1e9)).toEqual({ kind: 'undefined', reason: 'active' });
    const high = seriesEquivalent({ re: 0.2, im: 0.4 }, 50, 1e308);
    if (high.kind !== 'value') throw new Error('expected high frequency inductance');
    expect(high.value.value / (50 / 1e308 / (2 * Math.PI))).toBeCloseTo(1, 10);
    const highC = seriesEquivalent({ re: 0.2, im: -0.4 }, 50, 1e308);
    if (highC.kind !== 'value') throw new Error('expected high frequency capacitance');
    expect(highC.value.value / (1 / 1e308 / 50 / (2 * Math.PI))).toBeCloseTo(1, 8);
  });
  it('keeps a circular viewport, includes active loads and preserves zoom anchor', () => {
    const v = fitViewport(400, 200, [{ re: 2, im: 0 }], 10)!;
    expect(v.scale).toBe(45);
    expect(gammaToPoint({ re: 2, im: 0 }, v)).toEqual({ x: 290, y: 100 });
    expect(gammaToPoint({ re: 0, im: 1 }, v)).toEqual({ x: 200, y: 55 });
    const anchor = { x: 240, y: 60 };
    const before = pointToGamma(anchor, v)!;
    const zoomed = zoomAt(v, anchor, 2)!;
    expect(pointToGamma(anchor, zoomed)!.re).toBeCloseTo(before.re, 12);
    expect(pointToGamma(anchor, zoomed)!.im).toBeCloseTo(before.im, 12);
    expect(gammaToPoint(before, panBy(v, { x: 10, y: -5 })!)!.x).toBeCloseTo(anchor.x + 10, 12);
    expect(gammaToPoint(before, panBy(v, { x: 10, y: -5 })!)!.y).toBeCloseTo(anchor.y - 5, 12);
    expect(zoomAt(v, anchor, 0)).toBeNull();
  });
});
