import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { nearestRow, rowWindow, visibleRows } from '../../domain/table-rows';
import type { TableRows } from '../../domain/table-rows';

export interface TableColumn {
  readonly id: string;
  /** The trace's display name, e.g. "S21 · dB" or "smoothed · SG 7" (renamed names included). */
  readonly label: string;
  /** Unit shown after the label, e.g. "dB". */
  readonly unit?: string;
  /** Trace colour (CSS colour or var()). */
  readonly color: string;
  /** When the trace has a symbol, pass the same 16 × 12 line sample the Traces list uses; otherwise a swatch is drawn. */
  readonly sample?: ReactNode;
}

export type TableMode = 'near' | 'all';

const X_COL = 120;
const VALUE_COL = 112;

/**
 * Table pane renderer (table kit, 11 Nov). Presentational: the pane owner supplies merged rows
 * (mergeTableRows), the shared cursor X and formatters.
 * - mode 'near'  ("Near cursor"): as many rows as fit, the cursor row kept in the middle, no vertical scroll.
 * - mode 'all'   ("Every point"): every row in a scroll box, virtualized (only visible rows are in the DOM);
 *   when the cursor row leaves the view the box scrolls to centre it.
 * X column and header stay put while scrolling sideways or down.
 */
export function TablePane({ xLabel, xUnit, columns, rows, cursorX, mode, formatX, formatY, status }: {
  xLabel: string;
  xUnit: string;
  columns: readonly TableColumn[];
  rows: TableRows;
  cursorX: number | null;
  mode: TableMode;
  formatX: (x: number) => string;
  formatY: (y: number, column: TableColumn) => string;
  /** Right side of the footer, e.g. "Following Pane 1" or "Own traces". */
  status?: string;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const [rowH, setRowH] = useState(24);
  const [viewH, setViewH] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  const total = rows.x.length;
  const cursor = cursorX === null ? -1 : nearestRow(rows.x, cursorX);
  // Every row is its own grid, so column widths must not depend on content: fixed X column, equal value columns
  // with a minimum, and a fixed minimum row width. Then header and rows line up exactly.
  const template = `${X_COL}px repeat(${Math.max(columns.length, 1)}, minmax(${VALUE_COL}px, 1fr))`;
  const minWidth = X_COL + Math.max(columns.length, 1) * VALUE_COL;

  // Row height = the header row's height (same CSS), viewport = the scroll box minus the header.
  useLayoutEffect(() => {
    const el = scroll.current, h = head.current;
    if (!el || !h) return;
    const measure = () => { setRowH(Math.max(1, h.offsetHeight)); setViewH(Math.max(0, el.clientHeight - h.offsetHeight)); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Every point: keep the cursor row in view, centring it when it leaves.
  useEffect(() => {
    const el = scroll.current;
    if (mode !== 'all' || !el || cursor < 0) return;
    const top = cursor * rowH, bottom = top + rowH;
    if (top < el.scrollTop || bottom > el.scrollTop + viewH) el.scrollTop = Math.max(0, top - (viewH - rowH) / 2);
  }, [cursor, mode, rowH, viewH]);

  let start: number, end: number;
  if (mode === 'near') [start, end] = rowWindow(cursor, total, Math.max(1, Math.floor(viewH / rowH)));
  else [start, end] = visibleRows(scrollTop, viewH, rowH, total);

  const body: ReactNode[] = [];
  for (let r = start; r < end; r++) {
    const x = rows.x[r];
    const cells = rows.cells[r];
    if (x === undefined || !cells) continue;
    body.push(
      <div key={r} role="row" aria-selected={r === cursor || undefined} className={`tbp-row${r === cursor ? ' is-cursor' : ''}`} style={{ gridTemplateColumns: template, minWidth }}>
        <span role="rowheader" className="tbp-x">{formatX(x)}</span>
        {columns.map((c, k) => {
          const v = cells[k];
          return <span key={c.id} role="cell" className={v === null || v === undefined ? 'tbp-c is-empty' : 'tbp-c'}>{v === null || v === undefined ? '–' : formatY(v, c)}</span>;
        })}
      </div>,
    );
  }

  const first = rows.x[0], last = rows.x[total - 1];
  const range = first !== undefined && last !== undefined ? `${formatX(first)} → ${formatX(last)} ${xUnit}` : '';
  const where = mode === 'all' && cursor >= 0 ? `Row ${cursor + 1} of ${total}` : `${total} rows`;

  return (
    <div className="tbp" data-mode={mode}>
      <div ref={scroll} className="tbp-scroll" role="table" aria-rowcount={total + 1} aria-colcount={columns.length + 1}
        onScroll={e => { if (mode === 'all') setScrollTop(e.currentTarget.scrollTop); }}>
        <div ref={head} role="row" className="tbp-row tbp-head" style={{ gridTemplateColumns: template, minWidth }}>
          <span role="columnheader" className="tbp-x">{xLabel} <span className="tbp-unit">({xUnit})</span></span>
          {columns.map(c => (
            <span key={c.id} role="columnheader" className="tbp-c tbp-colhead" title={c.label}>
              {c.sample ?? <span className="tbp-swatch" style={{ background: c.color }} />}
              <span className="tbp-name">{c.label}</span>
              {c.unit && <span className="tbp-unit">({c.unit})</span>}
            </span>
          ))}
        </div>
        {mode === 'all'
          ? <div style={{ paddingTop: start * rowH, paddingBottom: Math.max(0, total - end) * rowH }}>{body}</div>
          : body}
      </div>
      <div className="tbp-foot"><span>{where}{range ? ` · ${range}` : ''}</span>{status && <span>{status}</span>}</div>
    </div>
  );
}
