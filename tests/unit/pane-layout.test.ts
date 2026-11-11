import { describe, expect, it } from 'vitest';
import { arrange, availablePresets, defaultTitle, equalSizes, fallbackPreset, isDefaultTitle, moveDivider, normalizeSizes, presetFits, renumberTitles, splitPercentages, xTickVisibility } from '../../src/domain/pane-layout';

describe('pane layouts', () => {
  it('shares X tick labels only between adjacent linked rows', () => {
    const a = { xUnit: 'Hz', xExtent: [1, 10] as const };
    const b = { xUnit: 'Hz', xExtent: [1, 20] as const };
    const other = { xUnit: 's', xExtent: [1, 10] as const };
    expect(xTickVisibility('rows', [a, a], true, false)).toEqual([false, true]);
    expect(xTickVisibility('rows', [a, b], true, false)).toEqual([true, true]);
    expect(xTickVisibility('rows', [a, { ...a, xExtent: [1, 10 + 1e-12] }], true, false)).toEqual([false, true]);
    expect(xTickVisibility('rows', [a, { ...a, xExtent: null }], true, false)).toEqual([true, true]);
    expect(xTickVisibility('rows', [a, b], true, true)).toEqual([false, true]);
    expect(xTickVisibility('rows', [a, other], true, true)).toEqual([true, true]);
    expect(xTickVisibility('rows', [a, a], false, true)).toEqual([true, true]);
    expect(xTickVisibility('columns', [a, a], true, true)).toEqual([true, true]);
    expect(xTickVisibility('rows', [a, a, a], true, false)).toEqual([false, false, true]);
  });
  it('reports all preset rules for both limits', () => {
    for (const limit of [4, 8]) for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const options = availablePresets(n, limit);
      expect(options).toHaveLength(4);
      expect(options[0]?.ok).toBe(n <= limit);
      expect(options[1]?.ok).toBe(n <= limit);
      expect(options[2]?.ok).toBe(n === 4);
      expect(options[3]?.ok).toBe(n >= 3 && n <= 4);
    }
    expect(presetFits('grid', 3, 8)).toEqual({ ok: false, reason: '2 × 2 needs exactly 4 panes' });
    expect(presetFits('one-side', 2, 8)).toEqual({ ok: false, reason: '1 + side needs 3 or 4 panes' });
    expect(presetFits('grid', 5, 8)).toEqual({ ok: false, reason: 'More than 4 panes: only Rows and Columns' });
    expect(fallbackPreset('grid', 3, 4)).toBe('rows');
    expect(fallbackPreset('columns', 3, 4)).toBe('columns');
  });
  it('arranges panes and gives dividers stable keys', () => {
    for (const n of [1, 2, 3, 4, 5, 8]) {
      expect(arrange('rows', n)).toMatchObject({ kind: 'rows', panes: Array.from({ length: n }, (_, i) => i) });
      expect(arrange('columns', n).dividers).toHaveLength(n - 1);
      expect(arrange('one-side', n)).toMatchObject({ main: 0, stack: Array.from({ length: n - 1 }, (_, i) => i + 1) });
    }
    expect(arrange('grid', 4)).toMatchObject({ panes: [[0, 1], [2, 3]], dividers: [{ key: 'grid:v' }, { key: 'grid:h:0' }] });
    expect(arrange('one-side', 3).dividers.map(d => d.key)).toEqual(['side:v', 'side:h:1']);
  });
  it('normalizes and clamps adjacent tracks in each orientation', () => {
    expect(normalizeSizes('rows', 2, { kind: 'rows', tracks: [1e308, 1e308] })).toEqual(equalSizes('rows', 2));
    expect(normalizeSizes('rows', 2, { kind: 'rows', tracks: [0, 0] })).toEqual(equalSizes('rows', 2));
    const tiny = normalizeSizes('rows', 2, { kind: 'rows', tracks: [1e-300, 2e-300] });
    if (tiny.kind !== 'rows' && tiny.kind !== 'columns') throw new Error('rows');
    expect(tiny.tracks[0]).toBeCloseTo(1 / 3); expect(tiny.tracks[1]).toBeCloseTo(2 / 3);
    expect(normalizeSizes('rows', 3, equalSizes('rows', 2))).toEqual(equalSizes('rows', 3));
    expect(moveDivider(equalSizes('rows', 2), 'rows:1', 999, 600, 120)).toEqual({ kind: 'rows', tracks: [0.8, 0.19999999999999996] });
    expect(moveDivider(equalSizes('columns', 2), 'columns:1', -999, 800, 160)).toEqual({ kind: 'columns', tracks: [0.2, 0.8] });
    expect(moveDivider(equalSizes('grid', 4), 'grid:v', -999, 800, 160)).toMatchObject({ cols: [0.2, 0.8] });
    expect(moveDivider(equalSizes('grid', 4), 'grid:h:0', -999, 600, 120)).toMatchObject({ rows: [0.2, 0.8] });
    expect(moveDivider(equalSizes('one-side', 3), 'side:v', -999, 800, 160)).toMatchObject({ main: 0.2 });
    expect(moveDivider(equalSizes('one-side', 3), 'side:h:1', -999, 600, 120)).toMatchObject({ stack: [0.2, 0.8] });
    expect(splitPercentages({ kind: 'rows', tracks: [0.25, 0.4, 0.35] }, 'rows:1')).toEqual([38, 62]);
  });
  it('renumbers default titles only', () => {
    expect(defaultTitle(1)).toBe('Pane 2');
    expect(isDefaultTitle('Pane 7')).toBe(true);
    expect(isDefaultTitle('Custom')).toBe(false);
    expect(renumberTitles([{ title: 'Pane 5' }, { title: 'Custom' }])).toEqual([{ title: 'Pane 1' }, { title: 'Custom' }]);
  });
});
