// Cell selection and copy for the Table pane. Pure, no React.
// Column 0 is the X column; column k (1…n) is trace k−1.
import type { TableRows } from './table-rows';

export interface CellPoint { readonly row: number; readonly col: number }
export interface CellSelection { readonly anchor: CellPoint; readonly focus: CellPoint }
export interface CellBounds { readonly r0: number; readonly r1: number; readonly c0: number; readonly c1: number }

export function selectionBounds(sel: CellSelection): CellBounds {
  return {
    r0: Math.min(sel.anchor.row, sel.focus.row), r1: Math.max(sel.anchor.row, sel.focus.row),
    c0: Math.min(sel.anchor.col, sel.focus.col), c1: Math.max(sel.anchor.col, sel.focus.col),
  };
}

export function inBounds(b: CellBounds | null, row: number, col: number): boolean {
  return b !== null && row >= b.r0 && row <= b.r1 && col >= b.c0 && col <= b.c1;
}

/** Keep a cell inside a table of `rows` × `cols` (cols includes the X column). */
export function clampCell(cell: CellPoint, rows: number, cols: number): CellPoint {
  return { row: Math.max(0, Math.min(rows - 1, cell.row)), col: Math.max(0, Math.min(cols - 1, cell.col)) };
}

/** Selections for a whole row, a whole column and the whole table. */
export const rowSelection = (row: number, cols: number): CellSelection => ({ anchor: { row, col: 0 }, focus: { row, col: cols - 1 } });
export const columnSelection = (col: number, rows: number): CellSelection => ({ anchor: { row: 0, col }, focus: { row: rows - 1, col } });
export const allSelection = (rows: number, cols: number): CellSelection => ({ anchor: { row: 0, col: 0 }, focus: { row: rows - 1, col: cols - 1 } });

/** Spreadsheets do not read U+2212 as a minus; copied numbers use "-". Empty cells copy as nothing. */
const plain = (text: string): string => text.replace(/−/g, '-');

/**
 * Tab-separated text of the selected cells, one line per row, as shown in the table (same units and decimals).
 * When whole columns are selected (every row), the column headings come first.
 */
export function selectionToTsv(
  rows: TableRows, b: CellBounds,
  format: { readonly x: (x: number) => string; readonly y: (y: number, column: number) => string },
  headings: readonly string[],
): string {
  const lines: string[] = [];
  if (b.r0 === 0 && b.r1 === rows.x.length - 1 && rows.x.length > 1) lines.push(headings.slice(b.c0, b.c1 + 1).join('\t'));
  for (let r = b.r0; r <= b.r1; r++) {
    const x = rows.x[r];
    const cells = rows.cells[r];
    if (x === undefined || !cells) continue;
    const out: string[] = [];
    for (let c = b.c0; c <= b.c1; c++) {
      if (c === 0) { out.push(plain(format.x(x))); continue; }
      const v = cells[c - 1];
      out.push(v === null || v === undefined ? '' : plain(format.y(v, c - 1)));
    }
    lines.push(out.join('\t'));
  }
  return lines.join('\n');
}
