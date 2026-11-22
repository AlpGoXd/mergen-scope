import { expect, it } from 'vitest';
import { formatChartPointerReadout } from '../../src/domain/chart/pointer-readout';

it('formats frequency and amplitude in the active trace units', () => {
  expect(formatChartPointerReadout(2.437e9, -12.31, 1e6, {
    domain: 'frequency', units: { x: 'Hz', y: 'dB' },
  })).toBe('2.437 GHz  −12.31 dB');
});

it('uses the trace domain to choose a fallback X unit', () => {
  expect(formatChartPointerReadout(0.001, 5, 0.01, {
    domain: 'time', units: { x: null, y: 'V' },
  })).toBe('1 ms  5.00 V');
});

it.each([null, NaN, Infinity])('omits the readout when Y is %s', y => {
  expect(formatChartPointerReadout(1, y, 10, null)).toBeNull();
});
