import { describe, expect, it } from 'vitest';
import { markRow, markerLabel, tableMarks } from '../../src/domain/table-markers';
import type { Marker } from '../../src/types/marker';

const marker = (id: string, trace: string, freq: number, extra: Partial<Marker> = {}): Marker =>
  ({ id, trace, freq, amp: 0, type: 'normal', label: null, refId: null, interpolated: false, ...extra });
const x = [1, 2, 3, 4];

describe('table markers', () => {
  it('labels markers like the chart', () => {
    expect(markerLabel({ type: 'normal' }, 0)).toBe('M1');
    expect(markerLabel({ type: 'delta' }, 2)).toBe('DM3');
  });
  it('puts a snapped marker on its row and trace column', () => {
    const marks = tableMarks([marker('m1', 'B', 3)], ['A', 'B'], x);
    expect([...marks.keys()]).toEqual([2]);
    expect(marks.get(2)).toEqual([{ markerId: 'm1', index: 0, label: 'M1', delta: false, between: false, column: 1, x: 3 }]);
  });
  it('shows an interpolated marker on the nearest row, flagged as between rows', () => {
    const marks = tableMarks([marker('m1', 'A', 2.4, { interpolated: true })], ['A'], x);
    expect(marks.get(1)?.[0]).toMatchObject({ label: 'M1', between: true, column: 0 });
  });
  it('leaves out markers on other traces or outside the rows, and keeps several on one row', () => {
    const marks = tableMarks([marker('m1', 'C', 2), marker('m2', 'A', 9), marker('m3', 'A', 2), marker('m4', 'B', 2, { type: 'delta', refId: 'm3' })], ['A', 'B'], x);
    expect([...marks.keys()]).toEqual([1]);
    expect(marks.get(1)?.map(mark => mark.label)).toEqual(['M3', 'DM4']);
    expect(markRow(marks, 'm4')).toBe(1);
    expect(markRow(marks, 'm2')).toBe(-1);
    expect(markRow(marks, null)).toBe(-1);
    expect(tableMarks([marker('m1', 'A', 1)], ['A'], []).size).toBe(0);
  });
});
