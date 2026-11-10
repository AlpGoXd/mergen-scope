import { describe, expect, it } from 'vitest';
import { alignAndCompute, describeStimulus } from '../../src/domain/analysis/trace-math-align';
import type { MathFill, MathPoints } from '../../src/domain/analysis/trace-math-align';
import { makeTestTrace } from './helpers';

function network(xs: number[], values: { re: number; im: number }[]) {
  return makeTestTrace({ kind: 'raw', family: 'network', data: xs.map((freq, i) => ({ freq, amp: 20 * Math.log10(Math.hypot(values[i]?.re ?? 1, values[i]?.im ?? 0)) })), networkSource: { row: 0, col: 0, view: 'magnitude-db' }, touchstoneNetwork: { parameterType: 'S', portCount: 1, referenceOhms: [50], freqUnit: 'Hz', dataFormat: 'RI', comments: [], matrixFormat: 'full', version: 1, samples: xs.map((freq, i) => ({ freq, sMatrix: [[values[i] ?? { re: 1, im: 0 }]] })) } });
}

const a = makeTestTrace({ data: [{ freq: 0, amp: 0 }, { freq: 1, amp: 2 }, { freq: 2, amp: 4 }] });
const b = makeTestTrace({ data: [{ freq: 0, amp: 2 }, { freq: 0.5, amp: 4 }, { freq: 2, amp: 8 }] });

describe('trace math stimulus alignment', () => {
  it('computes identical samples without choices', () => {
    expect(describeStimulus(a, a).identical).toBe(true);
    expect(alignAndCompute(a, a, 'add', undefined, undefined)).toEqual({ data: a.data.map(p => ({ freq: p.freq, amp: p.amp * 2 })) });
  });
  it('requires both choices', () => {
    expect(alignAndCompute(a, b, 'add', undefined, undefined)).toEqual({ reason: 'Choose Points and Fill gaps.' });
    expect(alignAndCompute(a, b, 'add', 'a', undefined)).toEqual({ reason: 'Choose Points and Fill gaps.' });
  });
  for (const points of ['a', 'b', 'both'] as MathPoints[]) for (const fill of ['linear', 'cubic', 'nearest', 'previous', 'next', 'sinc'] as MathFill[]) {
    it(`aligns ${points} with ${fill}`, () => {
      const result = alignAndCompute(a, b, 'add', points, fill);
      expect('data' in result && result.data.every(p => Number.isFinite(p.amp) && p.freq >= 0 && p.freq <= 2)).toBe(true);
      expect('data' in result && result.data.length).toBe(points === 'both' ? 4 : 3);
    });
  }
  it('restricts both orders to the overlap', () => {
    const c = makeTestTrace({ data: [{ freq: 0.5, amp: 1 }, { freq: 1.5, amp: 1 }] });
    for (const [left, right] of [[a, c], [c, a]] as const) {
      const result = alignAndCompute(left, right, 'add', 'both', 'linear');
      expect('data' in result && result.data.map(p => p.freq)).toEqual([0.5, 1, 1.5]);
    }
  });
  it('never extrapolates coarse wide and fine narrow traces in either order', () => {
    const wide = makeTestTrace({ data: [{ freq: 0, amp: 0 }, { freq: 2, amp: 2 }, { freq: 4, amp: 4 }] });
    const narrow = makeTestTrace({ data: [1, 1.5, 2, 2.5, 3].map(freq => ({ freq, amp: freq })) });
    for (const [left, right] of [[wide, narrow], [narrow, wide]] as const) for (const points of ['a', 'b', 'both'] as const) {
      const result = alignAndCompute(left, right, 'add', points, 'linear');
      if (!('data' in result)) throw new Error(result.reason);
      expect(result.data.every(p => p.freq >= 1 && p.freq <= 3)).toBe(true);
    }
  });
  it('fills two complex network traces before conversion in either order', () => {
    const coarse = network([0, 2], [{ re: 1, im: 0 }, { re: 0, im: 1 }]);
    const fine = network([0, 1, 2], [{ re: 1, im: 0 }, { re: 1, im: 0 }, { re: 1, im: 0 }]);
    for (const [left, right, points] of [[coarse, fine, 'b'], [fine, coarse, 'a']] as const) {
      const result = alignAndCompute(left, right, 'add', points, 'linear');
      if (!('data' in result)) throw new Error(result.reason);
      expect(result.data[1]?.amp).toBeCloseTo(20 * Math.log10(Math.SQRT1_2));
      expect(result.data[1]?.amp).not.toBeCloseTo(0);
    }
  });
  it('reports incompatible domains and disjoint ranges', () => {
    expect(alignAndCompute(a, { ...b, domain: 'time' }, 'add', 'a', 'linear')).toEqual({ reason: 'Cannot combine a time trace (s) with a frequency trace (Hz).' });
    expect(alignAndCompute(a, { ...b, data: [{ freq: 3, amp: 1 }] }, 'add', 'a', 'linear')).toEqual({ reason: 'The traces do not overlap in X, nothing to combine.' });
  });
  it('drops division by zero', () => {
    const result = alignAndCompute(a, a, 'divide', undefined, undefined);
    expect('data' in result && result.data.map(p => p.freq)).toEqual([1, 2]);
  });
  it.each([['linear', 16 / 3, 1], ['previous', 4, 0], ['next', 8, 2], ['nearest', 4, 0]] as const)('uses hand-computed %s values for each point set', (fill, bAtOne, aAtHalf) => {
    for (const points of ['a', 'b', 'both'] as const) {
      const result = alignAndCompute(a, b, 'subtract', points, fill);
      if (!('data' in result)) throw new Error(result.reason);
      if (points !== 'b') expect(result.data.find(p => p.freq === 1)?.amp).toBeCloseTo(2 - bAtOne);
      if (points !== 'a') expect(result.data.find(p => p.freq === 0.5)?.amp).toBeCloseTo(aAtHalf - 4);
    }
  });
  it('interpolates complex network values before converting to dB', () => {
    const network = makeTestTrace({ kind: 'raw', family: 'network', data: [{ freq: 0, amp: 0 }, { freq: 2, amp: 0 }], networkSource: { row: 0, col: 0, view: 'magnitude-db' }, touchstoneNetwork: { parameterType: 'S', portCount: 1, referenceOhms: [50], freqUnit: 'Hz', dataFormat: 'RI', comments: [], matrixFormat: 'full', version: 1, samples: [{ freq: 0, sMatrix: [[{ re: 1, im: 0 }]] }, { freq: 2, sMatrix: [[{ re: 0, im: 1 }]] }] } });
    const scalar = makeTestTrace({ data: [{ freq: 0, amp: 0 }, { freq: 1, amp: 0 }, { freq: 2, amp: 0 }] });
    const result = alignAndCompute(scalar, network, 'add', 'a', 'linear');
    if (!('data' in result)) throw new Error(result.reason);
    expect(result.data[1]?.amp).toBeCloseTo(20 * Math.log10(Math.SQRT1_2));
  });
  it('keeps A samples in the overlap for mixed spectrum and network grids in either order', () => {
    const spectrum = makeTestTrace({ data: Array.from({ length: 1001 }, (_, i) => ({ freq: 1.42e9 + i * 1000, amp: 2 })) });
    const xs = Array.from({ length: 201 }, (_, i) => 1e4 + i * (8.5e9 - 1e4) / 200);
    const swept = network(xs, xs.map(() => ({ re: 0.5, im: 0.5 })));
    for (const [left, right] of [[spectrum, swept], [swept, spectrum]] as const) {
      for (const operation of ['add', 'subtract', 'multiply', 'divide'] as const) {
        const result = alignAndCompute(left, right, operation, 'a', 'linear');
        const expected = left.data.filter(p => p.freq >= Math.max(left.data[0]?.freq ?? 0, right.data[0]?.freq ?? 0) && p.freq <= Math.min(left.data[left.data.length - 1]?.freq ?? 0, right.data[right.data.length - 1]?.freq ?? 0)).map(p => p.freq);
        if (expected.length === 0) expect(result).toEqual({ reason: 'No valid points to combine.' });
        else if ('data' in result) expect(result.data.map(p => p.freq)).toEqual(expected);
        else throw new Error(result.reason);
      }
    }
  });
});
