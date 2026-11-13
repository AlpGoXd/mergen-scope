import { describe, expect, it } from 'vitest';
import { mergeTableRows, nearestRow, rowWindow, visibleRows } from '../../src/domain/table-rows';

describe('mergeTableRows', () => {
  it('lines up traces on the same X points', () => {
    const r = mergeTableRows([{ id: 'a', xs: [1, 2, 3], ys: [10, 20, 30] }, { id: 'b', xs: [1, 2, 3], ys: [-1, -2, -3] }]);
    expect(r.x).toEqual([1, 2, 3]);
    expect(r.cells).toEqual([[10, -1], [20, -2], [30, -3]]);
  });
  it('uses the union of X and leaves gaps empty (never interpolates)', () => {
    const r = mergeTableRows([{ id: 'a', xs: [1, 2, 3], ys: [10, 20, 30] }, { id: 'b', xs: [1.5, 3], ys: [5, 6] }]);
    expect(r.x).toEqual([1, 1.5, 2, 3]);
    expect(r.cells).toEqual([[10, null], [null, 5], [20, null], [30, 6]]);
  });
  it('treats nearly equal X from two files as one row', () => {
    const r = mergeTableRows([{ id: 'a', xs: [2.4e9, 2.5e9], ys: [1, 2] }, { id: 'b', xs: [2.4e9 + 0.01, 2.5e9], ys: [3, 4] }]);
    expect(r.x.length).toBe(2);
    expect(r.cells[0]).toEqual([1, 3]);
  });
  it('keeps only the visible range', () => {
    const r = mergeTableRows([{ id: 'a', xs: [1, 2, 3, 4], ys: [1, 2, 3, 4] }], { min: 2, max: 3 });
    expect(r.x).toEqual([2, 3]);
  });
  it('turns non-finite samples into empty cells and handles no data', () => {
    expect(mergeTableRows([{ id: 'a', xs: [1], ys: [Number.NaN] }]).cells).toEqual([[null]]);
    expect(mergeTableRows([])).toEqual({ x: [], cells: [] });
    expect(mergeTableRows([{ id: 'a', xs: [], ys: [] }])).toEqual({ x: [], cells: [] });
  });
});

describe('nearestRow', () => {
  const x = [1, 2, 4, 8];
  it('finds the nearest X', () => {
    expect(nearestRow(x, 2.9)).toBe(1);
    expect(nearestRow(x, 3.1)).toBe(2);
    expect(nearestRow(x, -5)).toBe(0);
    expect(nearestRow(x, 100)).toBe(3);
  });
  it('returns -1 with no rows or no cursor', () => {
    expect(nearestRow([], 1)).toBe(-1);
    expect(nearestRow(x, Number.NaN)).toBe(-1);
  });
});

describe('rowWindow', () => {
  it('centres the cursor row', () => { expect(rowWindow(50, 401, 11)).toEqual([45, 56]); });
  it('clamps at the ends', () => {
    expect(rowWindow(1, 401, 11)).toEqual([0, 11]);
    expect(rowWindow(400, 401, 11)).toEqual([390, 401]);
  });
  it('handles short tables and no cursor', () => {
    expect(rowWindow(2, 5, 11)).toEqual([0, 5]);
    expect(rowWindow(-1, 401, 11)).toEqual([0, 11]);
    expect(rowWindow(3, 0, 11)).toEqual([0, 0]);
  });
});

describe('visibleRows', () => {
  it('renders the rows in view plus overscan', () => { expect(visibleRows(240, 240, 24, 1001, 8)).toEqual([2, 28]); });
  it('clamps at the start and end', () => {
    expect(visibleRows(0, 240, 24, 1001, 8)).toEqual([0, 18]);
    expect(visibleRows(24 * 995, 240, 24, 1001, 8)).toEqual([987, 1001]);
  });
  it('handles empty input', () => { expect(visibleRows(0, 240, 24, 0)).toEqual([0, 0]); });
});
