import { describe, expect, it } from 'vitest';
import { layoutLegend, wrapLegendLabel } from '../../src/domain/export-image';
import { fitAxisTitle } from '../../src/domain/export-plot';

const measure = (text: string) => text.length * 6;

describe('export text never gets cut off', () => {
  it('keeps a legend name that fits on one line', () => {
    expect(wrapLegendLabel('S11 · dB', 120, measure)).toEqual(['S11 · dB']);
  });
  it('wraps a long legend name at spaces, then after _ or ., then inside a word', () => {
    expect(wrapLegendLabel('waveform_sinc_test.csv signal_1khz', 140, measure)).toEqual(['waveform_sinc_test.csv', 'signal_1khz']);
    expect(wrapLegendLabel('waveform_sinc_test.csv', 55, measure)).toEqual(['waveform_', 'sinc_', 'test.csv']);
    const parts = wrapLegendLabel('abcdefghijklmnop', 30, measure);
    expect(parts.join('')).toBe('abcdefghijklmnop');
    expect(parts.every(part => measure(part) <= 30)).toBe(true);
  });
  it('a wrapped item makes its legend row taller', () => {
    const opts = { itemGap: 10, rowHeight: 16, padding: 4 };
    expect(layoutLegend([100, 100], 300, opts, [2, 1])).toEqual({ items: [{ x: 4, y: 4 }, { x: 114, y: 4 }], height: 4 + 32 + 4 });
    expect(layoutLegend([200, 200], 300, opts, [2, 1])).toEqual({ items: [{ x: 4, y: 4 }, { x: 4, y: 36 }], height: 36 + 16 + 4 });
  });
  it('a Y title taller than the plot falls back to its unit, then to nothing', () => {
    expect(fitAxisTitle('Magnitude (dB)', 100, 5)).toBe('Magnitude (dB)');
    expect(fitAxisTitle('Magnitude (dB)', 40, 5)).toBe('(dB)');
    expect(fitAxisTitle('Magnitude (dB)', 10, 5)).toBe('');
    expect(fitAxisTitle('Amplitude', 20, 5)).toBe('');
  });
});
