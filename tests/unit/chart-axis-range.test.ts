import { describe, expect, it } from 'vitest';
import {
  applyAxisMax,
  applyAxisMin,
  applyAxisPerDiv,
  AXIS_DIVISIONS,
  formatAxisBound,
  parseAxisValue,
} from '../../src/domain/chart/axis-range';

describe('parseAxisValue', () => {
  it('parses engineering notation, plain numbers, unicode minus, and matching units', () => {
    expect(parseAxisValue('2.4 GHz', 'Hz')).toEqual({ ok: true, value: 2.4e9 });
    expect(parseAxisValue('500 M', 'Hz')).toEqual({ ok: true, value: 5e8 });
    expect(parseAxisValue('25 ms', 's')).toEqual({ ok: true, value: 0.025 });
    expect(parseAxisValue('−40 dBm', 'dBm')).toEqual({ ok: true, value: -40 });
    expect(parseAxisValue('-30', 'dB')).toEqual({ ok: true, value: -30 });
    expect(parseAxisValue('90 deg', 'deg')).toEqual({ ok: true, value: 90 });
  });

  it('strips /div when requested', () => {
    expect(parseAxisValue('200 k/div', 'Hz', true)).toEqual({ ok: true, value: 2e5 });
    expect(parseAxisValue('10 /div', 'dB', true)).toEqual({ ok: true, value: 10 });
    expect(parseAxisValue('10/div', 'dB', false).ok).toBe(false);
  });

  it('rejects empty, invalid, and mismatched-unit text', () => {
    expect(parseAxisValue('', 'Hz').ok).toBe(false);
    expect(parseAxisValue('abc', 'Hz').ok).toBe(false);
    expect(parseAxisValue('10 ms', 'Hz').ok).toBe(false);
    expect(parseAxisValue('NaN', 'Hz').ok).toBe(false);
  });
});

describe('formatAxisBound', () => {
  it('formats prefixable SI units with engineering prefixes and log/custom units cleanly', () => {
    expect(formatAxisBound(2.45e9, 'Hz')).toBe('2.45 GHz');
    expect(formatAxisBound(0.025, 's')).toBe('25 ms');
    expect(formatAxisBound(-40, 'dBm')).toBe('-40 dBm');
    expect(formatAxisBound(0, 'V')).toBe('0 V');
    expect(formatAxisBound(12.34567, null)).toBe('12.3457');
  });
});

describe('applyAxisMin / applyAxisMax', () => {
  const linear = { min: 1e9, max: 3e9 };

  it('updates min and max when valid', () => {
    expect(applyAxisMin(linear, '1.5 GHz', 'linear', 'Hz')).toEqual({
      ok: true,
      range: { min: 1.5e9, max: 3e9 },
    });
    expect(applyAxisMax(linear, '4 GHz', 'linear', 'Hz')).toEqual({
      ok: true,
      range: { min: 1e9, max: 4e9 },
    });
  });

  it('rejects inverted or equal bounds', () => {
    expect(applyAxisMin(linear, '3 GHz', 'linear', 'Hz').ok).toBe(false);
    expect(applyAxisMin(linear, '4 GHz', 'linear', 'Hz').ok).toBe(false);
    expect(applyAxisMax(linear, '1 GHz', 'linear', 'Hz').ok).toBe(false);
    expect(applyAxisMax(linear, '0.5 GHz', 'linear', 'Hz').ok).toBe(false);
  });

  it('enforces strictly positive values on log axes', () => {
    expect(applyAxisMin({ min: 10, max: 1000 }, '0', 'log', 'Hz').ok).toBe(false);
    expect(applyAxisMin({ min: 10, max: 1000 }, '-5', 'log', 'Hz').ok).toBe(false);
    expect(applyAxisMin({ min: 10, max: 1000 }, '1', 'log', 'Hz')).toEqual({
      ok: true,
      range: { min: 1, max: 1000 },
    });
  });
});

describe('applyAxisPerDiv', () => {
  it('keeps the current center fixed and sets span to AXIS_DIVISIONS * step', () => {
    const result = applyAxisPerDiv({ min: -50, max: 10 }, '5', 'linear', 'dB');
    // center = -20, span = 6 * 5 = 30 -> [-35, -5]
    expect(AXIS_DIVISIONS).toBe(6);
    expect(result).toEqual({ ok: true, range: { min: -35, max: -5 } });
  });

  it('parses SI prefixes and /div suffix on frequency axes', () => {
    const result = applyAxisPerDiv({ min: 1e9, max: 3e9 }, '200 M/div', 'linear', 'Hz');
    // center = 2 GHz, span = 6 * 200 MHz = 1.2 GHz -> [1.4 GHz, 2.6 GHz]
    expect(result).toEqual({ ok: true, range: { min: 1.4e9, max: 2.6e9 } });
  });

  it('rejects non-positive steps and log axes', () => {
    expect(applyAxisPerDiv({ min: 0, max: 10 }, '0', 'linear', 'V').ok).toBe(false);
    expect(applyAxisPerDiv({ min: 0, max: 10 }, '-2', 'linear', 'V').ok).toBe(false);
    expect(applyAxisPerDiv({ min: 1, max: 100 }, '10', 'log', 'Hz').ok).toBe(false);
  });
});
