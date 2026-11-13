import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { nearestRow, visibleRows } from '../../domain/table-rows';
import type { TableRows } from '../../domain/table-rows';
import { allSelection, clampCell, columnSelection, inBounds, rowSelection, selectionBounds, selectionToTsv } from '../../domain/table-selection';
import type { CellPoint, CellSelection } from '../../domain/table-selection';

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

const X_COL = 120;
const VALUE_COL = 112;

async function writeClipboard(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back below */ }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed'; area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  area.remove();
  return ok;
}

/**
 * Table pane renderer (table kit, 11 Nov; every point, selectable). Presentational: the pane owner supplies merged
 * rows (mergeTableRows), the shared cursor X and formatters.
 * - Every row is in a scroll box, virtualized (only visible rows plus overscan are in the DOM); when the cursor row
 *   leaves the view the box scrolls to centre it.
 * - Click a cell, drag or Shift-click for a block, click the X value for a row, a heading for a column, Ctrl+A for all.
 *   Arrow keys move (Shift extends), Ctrl+C copies tab-separated text, Esc clears.
 * X column and header stay put while scrolling sideways or down.
 */
export function TablePane({ xLabel, xUnit, columns, rows, cursorX, formatX, formatY, status }: {
  xLabel: string;
  xUnit: string;
  columns: readonly TableColumn[];
  rows: TableRows;
  cursorX: number | null;
  formatX: (x: number) => string;
  formatY: (y: number, column: TableColumn) => string;
  /** Right side of the footer. */
  status?: string;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [rowH, setRowH] = useState(24);
  const [viewH, setViewH] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [selection, setSelection] = useState<CellSelection | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const total = rows.x.length;
  const cols = columns.length + 1;
  const cursor = cursorX === null ? -1 : nearestRow(rows.x, cursorX);
  const bounds = selection ? selectionBounds(selection) : null;
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

  // Rows or columns changed (other traces, other range): an old selection may point past the end.
  useEffect(() => { setSelection(null); }, [total, cols]);
  useEffect(() => { const stop = () => { dragging.current = false; }; window.addEventListener('mouseup', stop); return () => window.removeEventListener('mouseup', stop); }, []);
  useEffect(() => { if (!copied) return; const t = window.setTimeout(() => setCopied(null), 2000); return () => window.clearTimeout(t); }, [copied]);

  const reveal = (row: number) => {
    const el = scroll.current;
    if (!el || row < 0) return;
    const top = row * rowH, bottom = top + rowH;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + viewH) el.scrollTop = bottom - viewH;
  };

  // Keep the cursor row in view, centring it when it leaves.
  useEffect(() => {
    const el = scroll.current;
    if (!el || cursor < 0) return;
    const top = cursor * rowH, bottom = top + rowH;
    if (top < el.scrollTop || bottom > el.scrollTop + viewH) el.scrollTop = Math.max(0, top - (viewH - rowH) / 2);
  }, [cursor, rowH, viewH]);

  const copy = () => {
    if (!bounds || total === 0) return;
    const headings = [`${xLabel} (${xUnit})`, ...columns.map(c => c.unit ? `${c.label} (${c.unit})` : c.label)];
    const text = selectionToTsv(rows, bounds, { x: formatX, y: (y, k) => { const c = columns[k]; return c ? formatY(y, c) : String(y); } }, headings);
    const cells = (bounds.r1 - bounds.r0 + 1) * (bounds.c1 - bounds.c0 + 1);
    void writeClipboard(text).then(ok => setCopied(ok ? `Copied ${cells} ${cells === 1 ? 'cell' : 'cells'}` : 'Copy failed'));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (total === 0) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'c') { copy(); e.preventDefault(); e.stopPropagation(); return; }
    if (mod && key === 'a') { setSelection(allSelection(total, cols)); e.preventDefault(); e.stopPropagation(); return; }
    if (e.key === 'Escape' && selection) { setSelection(null); e.stopPropagation(); return; }
    const step: Record<string, CellPoint> = { ArrowUp: { row: -1, col: 0 }, ArrowDown: { row: 1, col: 0 }, ArrowLeft: { row: 0, col: -1 }, ArrowRight: { row: 0, col: 1 }, PageUp: { row: -Math.max(1, Math.floor(viewH / rowH) - 1), col: 0 }, PageDown: { row: Math.max(1, Math.floor(viewH / rowH) - 1), col: 0 } };
    const d = step[e.key];
    if (!d || mod) return;
    const from = selection?.focus ?? { row: Math.max(0, cursor), col: 1 };
    const to = clampCell({ row: from.row + d.row, col: from.col + d.col }, total, cols);
    setSelection(e.shiftKey && selection ? { anchor: selection.anchor, focus: to } : { anchor: to, focus: to });
    reveal(to.row);
    e.preventDefault(); e.stopPropagation();
  };

  const pick = (next: CellSelection, extend: boolean) => {
    scroll.current?.focus({ preventScroll: true });
    setSelection(extend && selection ? { anchor: selection.anchor, focus: next.focus } : next);
  };
  const cellDown = (row: number, col: number, shift: boolean) => {
    dragging.current = true;
    pick({ anchor: { row, col }, focus: { row, col } }, shift);
  };
  const cellEnter = (row: number, col: number) => {
    if (dragging.current && selection) setSelection({ anchor: selection.anchor, focus: { row, col } });
  };

  const [start, end] = visibleRows(scrollTop, viewH, rowH, total);
  const body: ReactNode[] = [];
  for (let r = start; r < end; r++) {
    const x = rows.x[r];
    const cells = rows.cells[r];
    if (x === undefined || !cells) continue;
    const sel = (col: number) => inBounds(bounds, r, col) ? ' is-sel' : '';
    body.push(
      <div key={r} role="row" aria-selected={r === cursor || undefined} className={`tbp-row${r === cursor ? ' is-cursor' : ''}`} style={{ gridTemplateColumns: template, minWidth }}>
        <span role="rowheader" className={`tbp-x${sel(0)}`} title="Click to select the row"
          onMouseDown={e => { if (e.button !== 0) return; e.preventDefault(); dragging.current = true; pick(e.shiftKey ? { anchor: { row: r, col: 0 }, focus: { row: r, col: cols - 1 } } : rowSelection(r, cols), e.shiftKey); }}
          onMouseEnter={() => { if (dragging.current && selection) setSelection({ anchor: selection.anchor, focus: { row: r, col: selection.focus.col } }); }}>{formatX(x)}</span>
        {columns.map((c, k) => {
          const v = cells[k];
          const empty = v === null || v === undefined;
          return <span key={c.id} role="cell" aria-selected={inBounds(bounds, r, k + 1) || undefined} className={`tbp-c${empty ? ' is-empty' : ''}${sel(k + 1)}`}
            onMouseDown={e => { if (e.button !== 0) return; e.preventDefault(); cellDown(r, k + 1, e.shiftKey); }}
            onMouseEnter={() => cellEnter(r, k + 1)}>{empty ? '–' : formatY(v, c)}</span>;
        })}
      </div>,
    );
  }

  const first = rows.x[0], last = rows.x[total - 1];
  const range = first !== undefined && last !== undefined ? `${formatX(first)} → ${formatX(last)} ${xUnit}` : '';
  const where = cursor >= 0 ? `Row ${cursor + 1} of ${total}` : `${total} rows`;
  const picked = bounds ? (bounds.r1 - bounds.r0 + 1) * (bounds.c1 - bounds.c0 + 1) : 0;

  return (
    <div className="tbp">
      <div ref={scroll} className="tbp-scroll" role="table" tabIndex={0} aria-label="Table: click cells to select, Ctrl+C to copy"
        aria-rowcount={total + 1} aria-colcount={cols} aria-multiselectable="true"
        onScroll={e => setScrollTop(e.currentTarget.scrollTop)} onKeyDown={onKeyDown}>
        <div ref={head} role="row" className="tbp-row tbp-head" style={{ gridTemplateColumns: template, minWidth }}>
          <span role="columnheader" className="tbp-x" title="Click to select the column"
            onMouseDown={e => { if (e.button !== 0 || total === 0) return; e.preventDefault(); pick(columnSelection(0, total), false); }}>{xLabel} <span className="tbp-unit">({xUnit})</span></span>
          {columns.map((c, k) => (
            <span key={c.id} role="columnheader" className="tbp-c tbp-colhead" title={`${c.label}: click to select the column`}
              onMouseDown={e => { if (e.button !== 0 || total === 0) return; e.preventDefault(); pick(columnSelection(k + 1, total), false); }}>
              {c.sample ?? <span className="tbp-swatch" style={{ background: c.color }} />}
              <span className="tbp-name">{c.label}</span>
              {c.unit && <span className="tbp-unit">({c.unit})</span>}
            </span>
          ))}
        </div>
        <div style={{ paddingTop: start * rowH, paddingBottom: Math.max(0, total - end) * rowH }}>{body}</div>
      </div>
      <div className="tbp-foot">
        <span>{where}{range ? ` · ${range}` : ''}</span>
        <span role="status">{copied ?? (picked > 1 ? `${picked} cells selected · Ctrl+C to copy` : picked === 1 ? 'Ctrl+C to copy' : status)}</span>
      </div>
    </div>
  );
}
