// Table pane rows (table kit, 11 Nov). Pure functions, no React.
// Rule: rows are the union of the traces' own X points. A trace with no sample at a row's X shows an empty cell.
// Never interpolate in a table: every number shown is a real sample (same rule as trace maths: never invent data).

export interface TableSource {
  readonly id: string;
  /** Ascending X values of the trace's samples. */
  readonly xs: ArrayLike<number>;
  readonly ys: ArrayLike<number>;
}

export interface TableRows {
  /** Ascending X of every row. */
  readonly x: readonly number[];
  /** cells[row][column]: the sample of source `column` at x[row], or null when that trace has no sample there. */
  readonly cells: readonly (readonly (number | null)[])[];
}

export interface XRange { readonly min: number; readonly max: number }

/**
 * Merge sources into rows. Two X values count as the same row when they differ by less than
 * `relTol` × the overall X span (default 1e-9), so 2.4e9 and 2.4000000001e9 from two files share a row.
 * `range` keeps only rows with min ≤ x ≤ max (the "Visible" range setting).
 */
export function mergeTableRows(sources: readonly TableSource[], range?: XRange, relTol = 1e-9): TableRows {
  let lo = Infinity, hi = -Infinity;
  for (const s of sources) {
    const n = Math.min(s.xs.length, s.ys.length);
    if (n === 0) continue;
    const a = s.xs[0], b = s.xs[n - 1];
    if (a !== undefined && a < lo) lo = a;
    if (b !== undefined && b > hi) hi = b;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { x: [], cells: [] };
  const tol = Math.max(Math.abs(hi - lo) * relTol, Number.MIN_VALUE);

  const idx = sources.map(() => 0);
  const x: number[] = [];
  const cells: (number | null)[][] = [];
  for (;;) {
    // Smallest X still waiting in any source.
    let next = Infinity;
    sources.forEach((s, k) => {
      const i = idx[k] ?? 0;
      if (i < Math.min(s.xs.length, s.ys.length)) { const v = s.xs[i]; if (v !== undefined && v < next) next = v; }
    });
    if (next === Infinity) break;
    const row: (number | null)[] = [];
    sources.forEach((s, k) => {
      const i = idx[k] ?? 0;
      const v = i < Math.min(s.xs.length, s.ys.length) ? s.xs[i] : undefined;
      if (v !== undefined && Math.abs(v - next) <= tol) {
        const y = s.ys[i];
        row.push(y === undefined || !Number.isFinite(y) ? null : y);
        idx[k] = i + 1;
      } else row.push(null);
    });
    if (!range || (next >= range.min - tol && next <= range.max + tol)) { x.push(next); cells.push(row); }
  }
  return { x, cells };
}

/** Index of the row whose X is nearest to `target` (binary search). -1 when there are no rows. */
export function nearestRow(x: readonly number[], target: number): number {
  const n = x.length;
  if (n === 0 || !Number.isFinite(target)) return -1;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((x[mid] ?? 0) < target) lo = mid; else hi = mid;
  }
  const a = x[lo] ?? 0, b = x[hi] ?? 0;
  return Math.abs(target - a) <= Math.abs(b - target) ? lo : hi;
}

/**
 * "Near cursor" mode: `count` consecutive rows with `center` as close to the middle as the ends allow.
 * Returns [start, end) row indices. With no cursor (center < 0) it starts at the first row.
 */
export function rowWindow(center: number, total: number, count: number): [number, number] {
  const c = Math.max(0, Math.min(count, total));
  if (c === 0) return [0, 0];
  if (center < 0) return [0, c];
  const start = Math.max(0, Math.min(total - c, center - Math.floor((c - 1) / 2)));
  return [start, start + c];
}

/**
 * "Every point" mode virtualization: which rows to render for a scroll position.
 * Fixed row height; `overscan` extra rows above and below. Returns [start, end).
 */
export function visibleRows(scrollTop: number, viewport: number, rowHeight: number, total: number, overscan = 8): [number, number] {
  if (total <= 0 || rowHeight <= 0) return [0, 0];
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const last = Math.ceil((Math.max(0, scrollTop) + Math.max(0, viewport)) / rowHeight);
  return [Math.max(0, first - overscan), Math.min(total, last + overscan)];
}
