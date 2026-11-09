import { describe, expect, it } from 'vitest';
import { formatEng } from '../../src/domain/format';
import { formatCrossingValue, lineCrossingRows, manualCrossingRows } from '../../src/domain/analysis/crossing-rows';

describe('crossing rows', () => {
  it('formats line columns with their own units', () => {
    const rows = lineCrossingRows([{ traceName: 'A', paneId: 'p', freq: 1.4204e9, amp: -12.5 }], { A: { xUnit: 'Hz', yUnit: 'dBm' } }, { p: 'Pane' });
    expect(rows[0]?.name).toBe('A · Pane');
    expect(rows[0]?.x).toBe(formatEng(1.4204e9, 'Hz', 1e4));
    expect(rows[0]?.y).toBe(formatEng(-12.5, 'dBm', 0.01));
    expect(JSON.stringify(rows)).not.toMatch(/e[+-]\d/i);
  });
  it('handles non-finite values and limits the displayed rows', () => {
    expect(formatCrossingValue(Infinity, 'Hz', 1)).toBe('--');
    const points = Array.from({ length: 55 }, (_, i) => ({ traceName: 'A', paneId: 'p', freq: i, amp: i }));
    const rows = lineCrossingRows(points, {}, {});
    expect(points.length).toBe(55);
    expect(rows).toHaveLength(50);
    expect(new Set(rows.map(row => row.key)).size).toBe(50);
  });
  it('keeps close crossings distinguishable and uses display labels and pane fallbacks', () => {
    const rows = lineCrossingRows(
      [{ traceName: 't1', paneId: 'p', freq: 1.42041e9, amp: -80 }, { traceName: 't1', paneId: 'p', freq: 1.42042e9, amp: -80 }],
      { t1: { xUnit: 'Hz', yUnit: 'dBm' } }, { p: '' }, { t1: 'S21' });
    expect(rows[0]?.x).not.toBe(rows[1]?.x);
    expect(rows[0]?.name).toBe('S21 · p');
  });
  it('omits y for manual rows and handles empty lists', () => {
    expect(manualCrossingRows([{ freq: 42, mode: 'rising' }], 'A', 'Hz')[0]).not.toHaveProperty('y');
    expect(manualCrossingRows([], 'A', 'Hz')).toEqual([]);
    expect(lineCrossingRows([], {}, {})).toEqual([]);
  });
});
