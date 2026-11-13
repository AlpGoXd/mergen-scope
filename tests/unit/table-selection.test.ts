import { describe, expect, it } from 'vitest';
import { allSelection, clampCell, columnSelection, inBounds, rowSelection, selectionBounds, selectionToTsv } from '../../src/domain/table-selection';
import { mergeTableRows } from '../../src/domain/table-rows';

const rows = mergeTableRows([{ id: 'a', xs: [1, 2, 3], ys: [-1.5, -2.5, -3.5] }, { id: 'b', xs: [1, 3], ys: [10, 30] }]);
const format = { x: (x: number) => x.toFixed(1), y: (y: number) => (y < 0 ? `−${(-y).toFixed(2)}` : y.toFixed(2)) };
const headings = ['Frequency (GHz)', 'A (dB)', 'B (dB)'];

describe('table selection', () => {
  it('normalises a dragged block in any direction', () => {
    const b = selectionBounds({ anchor: { row: 2, col: 2 }, focus: { row: 0, col: 1 } });
    expect(b).toEqual({ r0: 0, r1: 2, c0: 1, c1: 2 });
    expect(inBounds(b, 1, 1)).toBe(true);
    expect(inBounds(b, 1, 0)).toBe(false);
    expect(inBounds(null, 0, 0)).toBe(false);
  });
  it('builds row, column and whole-table selections and clamps keyboard moves', () => {
    expect(selectionBounds(rowSelection(1, 3))).toEqual({ r0: 1, r1: 1, c0: 0, c1: 2 });
    expect(selectionBounds(columnSelection(2, 3))).toEqual({ r0: 0, r1: 2, c0: 2, c1: 2 });
    expect(selectionBounds(allSelection(3, 3))).toEqual({ r0: 0, r1: 2, c0: 0, c1: 2 });
    expect(clampCell({ row: -1, col: 9 }, 3, 3)).toEqual({ row: 0, col: 2 });
  });
  it('copies one cell, a block and a row as tab-separated text with plain minus signs and empty gaps', () => {
    expect(selectionToTsv(rows, { r0: 1, r1: 1, c0: 1, c1: 1 }, format, headings)).toBe('-2.50');
    expect(selectionToTsv(rows, { r0: 0, r1: 1, c0: 1, c1: 2 }, format, headings)).toBe('-1.50\t10.00\n-2.50\t');
    expect(selectionToTsv(rows, selectionBounds(rowSelection(2, 3)), format, headings)).toBe('3.0\t-3.50\t30.00');
  });
  it('adds the headings when whole columns are copied', () => {
    expect(selectionToTsv(rows, selectionBounds(allSelection(3, 3)), format, headings)).toBe('Frequency (GHz)\tA (dB)\tB (dB)\n1.0\t-1.50\t10.00\n2.0\t-2.50\t\n3.0\t-3.50\t30.00');
    expect(selectionToTsv(rows, selectionBounds(columnSelection(2, 3)), format, headings)).toBe('B (dB)\n10.00\n\n30.00');
  });
});
