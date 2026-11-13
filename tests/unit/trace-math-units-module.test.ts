import { describe, expect, it } from 'vitest';
import { traceMathUnit } from '../../src/domain/trace-math-units';

describe('trace math units (decisions 2026-11-10)', () => {
  it.each([
    ['dBm', 'dB', 'add', 'dBm'],
    ['dB', 'dBm', 'add', 'dBm'],
    ['dB', 'dB', 'add', 'dB'],
    ['dBm', 'dB', 'subtract', 'dBm'],
    ['dBm', 'dBm', 'subtract', 'dB'],
    ['dB', 'dB', 'subtract', 'dB'],
    ['V', 'V', 'add', 'V'],
    ['V', 'V', 'subtract', 'V'],
    ['V', 'V', 'multiply', 'V²'],
    ['V', 'V', 'divide', ''],
    ['', '', 'add', ''],
  ] as const)('%s %s %s → %s', (a, b, op, unit) => {
    const r = traceMathUnit(a, b, op);
    expect(r.unit).toBe(unit);
    expect(r.warning).toBeUndefined();
  });

  it.each([
    ['dBm', 'dBm', 'add', 'convert to linear'],
    ['dB', 'dBm', 'subtract', 'no meaningful unit'],
    ['dB', 'dB', 'multiply', 'not multiplied'],
    ['dBm', 'dB', 'divide', 'not multiplied'],
    ['V', 'A', 'add', 'no meaningful unit'],
    ['dBm', 'dBW', 'subtract', 'different references'],
    ['V', '', 'add', 'no unit'],
  ] as const)('%s %s %s warns and has no unit', (a, b, op, text) => {
    const r = traceMathUnit(a, b, op);
    expect(r.unit).toBeNull();
    expect(r.warning).toContain(text);
  });
});
