// Markers in the Table pane. Pure, no React.
// A marker is drawn in its trace's column, on the row nearest its X. A snapped marker sits exactly on a row;
// an interpolated one lies between rows, so it is shown on the nearest row and flagged (the cell keeps the real sample).
import type { Marker } from '../types/marker';
import { nearestRow } from './table-rows';

export interface TableMark {
  readonly markerId: string;
  /** Index in the marker list (the chart's M1, DM2 … numbering). */
  readonly index: number;
  /** "M1", "DM2" — the same label the chart draws. */
  readonly label: string;
  readonly delta: boolean;
  /** The marker lies between this row and a neighbour. */
  readonly between: boolean;
  /** Trace column (0-based, without the X column). */
  readonly column: number;
  readonly x: number;
}

/** Same label as the chart: DM for delta markers, M otherwise, numbered by list position. */
export function markerLabel(marker: Pick<Marker, 'type'>, index: number): string {
  return `${marker.type === 'delta' ? 'DM' : 'M'}${index + 1}`;
}

/**
 * Marks per row for the table's columns (trace names in column order). Markers on traces that are not columns,
 * or outside the table's X range (Range = Visible), are left out.
 */
export function tableMarks(markers: readonly Marker[], columnTraces: readonly string[], x: readonly number[]): Map<number, TableMark[]> {
  const out = new Map<number, TableMark[]>();
  const first = x[0], last = x[x.length - 1];
  if (first === undefined || last === undefined) return out;
  const tol = Math.max(Math.abs(last - first) * 1e-9, Number.MIN_VALUE);
  markers.forEach((marker, index) => {
    const column = columnTraces.indexOf(marker.trace);
    if (column < 0 || !Number.isFinite(marker.freq) || marker.freq < first - tol || marker.freq > last + tol) return;
    const row = nearestRow(x, marker.freq);
    const rowX = x[row];
    if (row < 0 || rowX === undefined) return;
    const mark: TableMark = { markerId: marker.id, index, label: markerLabel(marker, index), delta: marker.type === 'delta', between: Math.abs(rowX - marker.freq) > tol, column, x: marker.freq };
    const list = out.get(row);
    if (list) list.push(mark); else out.set(row, [mark]);
  });
  return out;
}

/** Row of a marker in the table, or -1 when it is not shown. */
export function markRow(marks: ReadonlyMap<number, readonly TableMark[]>, markerId: string | null): number {
  if (markerId === null) return -1;
  for (const [row, list] of marks) if (list.some(mark => mark.markerId === markerId)) return row;
  return -1;
}
