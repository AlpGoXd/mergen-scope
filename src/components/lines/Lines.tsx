// Lines kit: presentation only (board P4c, LL-2). A reference line works like a trace:
// one row, pane badges that open "Show in", copies on the charts that say they are one line.
// The app owns state, pixel maths, drag, Undo and the shared popover (render the menus in it).
import type { CSSProperties, ReactElement } from 'react';
import type { MenuEntry } from '../left-panel/Menu';
import { EditableValue } from '../shared/EditableValue';
import type { ChartLineProps, CrossingDotProps, EdgeTagProps, LineRowProps, ShowInPane } from './types';

/* ---------- left panel ---------- */

/** Line 2 of the row: where it is shown and how many crossings, plus List…. Never a list itself. */
export function lineSummary(p: Pick<LineRowProps, 'panes' | 'crossings' | 'offView'>): string {
  if (p.panes.length === 0) return 'Not in a pane: choose one from the badge';
  const parts = [`Shown in ${p.panes.join(', ')}`];
  if (p.offView && p.offView.length) parts.push(`off view in ${p.offView.join(', ')}`);
  if (p.crossings) parts.push(p.crossings);
  return parts.join(' · ');
}

export function LineRow(p: LineRowProps): ReactElement {
  const unplaced = p.panes.length === 0;
  const single = p.kind === 'h';
  const badgeTip = single ? 'H lines belong to one pane' : unplaced ? 'Not in a pane: choose where to show it' : 'Show in…';
  const cls = ['lp-line', 'ln-row', p.lit ? 'is-lit' : '', p.selected ? 'lp-selected' : '', unplaced ? 'is-unplaced' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls} onMouseEnter={() => p.onHover?.(true)} onMouseLeave={() => p.onHover?.(false)}>
      <div className="lp-row">
        <span className="lp-tag lp-tag--line">{p.label}</span>
        <EditableValue className="lp-ev" label={`${p.label} value`} value={p.value} onCommit={p.onValue} />
        <button type="button" className="lp-panes" title={badgeTip} aria-label={`${p.label}: ${badgeTip}`}
          aria-haspopup={single ? undefined : 'menu'} aria-expanded={single ? undefined : (p.menuOpen ?? false)}
          aria-disabled={single && !unplaced ? true : undefined}
          onClick={(e) => { if (!single || unplaced) p.onPanes(e.currentTarget); }}>
          {unplaced ? <span className="lp-pane lp-pane--none">—</span> : p.panes.map((pn) => <span key={pn} className="lp-pane">{pn}</span>)}
        </button>
        <button type="button" className="lp-icon-btn" aria-label={`Delete ${p.label}`} onClick={p.onRemove}>×</button>
      </div>
      <div className="lp-sub">
        <span className="lp-sub__text">{lineSummary(p)}</span>
        {unplaced ? null : <button type="button" className="lp-link" onClick={p.onListCrossings}>List…</button>}
      </div>
    </div>
  );
}

/** "Show in" checklist for a V line: the same Menu and look as a trace's. */
export function lineShowInEntries(panes: ShowInPane[], onToggle: (paneId: string) => void): MenuEntry[] {
  return panes.map((p) => ({
    label: p.label, checked: p.checked, aside: p.aside, disabledReason: p.disabledReason,
    onSelect: p.disabledReason ? undefined : () => onToggle(p.id),
  }));
}

/** Right-click menu on a line or its label. "Show in" opens the checklist above as a second menu. */
export function lineContextEntries(opts: {
  label: string; kind: 'v' | 'h'; paneName: string;
  onShowIn: () => void; onEdit: () => void; onListCrossings: () => void; onRemoveHere: () => void; onDelete: () => void;
}): MenuEntry[] {
  const entries: MenuEntry[] = [];
  if (opts.kind === 'v') entries.push({ label: 'Show in', aside: '▸', onSelect: opts.onShowIn });
  entries.push({ label: 'Edit value…', aside: 'Enter', onSelect: opts.onEdit });
  entries.push({ label: 'List crossings', onSelect: opts.onListCrossings });
  entries.push('separator');
  if (opts.kind === 'v') entries.push({ label: `Remove from ${opts.paneName}`, onSelect: opts.onRemoveHere });
  entries.push({ label: `Delete ${opts.label}`, aside: 'Del', danger: true, onSelect: opts.onDelete });
  return entries;
}

/* ---------- chart (SVG, inside the pane's plot layer) ---------- */

const LABEL_H = 14;
const labelWidth = (text: string): number => Math.max(26, Math.round(text.length * 6.1 + 10));

/** One copy of a line: the dashed line, a wide hit area, and the label chip ("V1" or "V1 · 2"). */
export function ChartLine(p: ChartLineProps): ReactElement {
  const text = p.paneCount > 1 ? `${p.label} · ${p.paneCount}` : p.label;
  const w = labelWidth(text);
  const { left, top, width, height } = p.plot;
  const v = p.kind === 'v';
  const x1 = v ? p.at : left, x2 = v ? p.at : left + width;
  const y1 = v ? top : p.at, y2 = v ? top + height : p.at;
  // V: label centred on the line, 2 px under the plot top. H: label at the right end, centred on the line.
  const lx = v ? Math.min(Math.max(p.at - w / 2, left + 1), left + width - w - 1) : left + width - w - 4;
  const ly = v ? top + 2 : Math.min(Math.max(p.at - LABEL_H / 2, top + 1), top + height - LABEL_H - 1);
  const cls = ['ln-g', v ? 'ln-g--v' : 'ln-g--h', p.lit ? 'is-lit' : '', p.selected ? 'is-selected' : ''].filter(Boolean).join(' ');
  return (
    <g className={cls} role="img" aria-label={`${text} line`}
      onMouseEnter={() => p.onHover?.(true)} onMouseLeave={() => p.onHover?.(false)}
      onPointerDown={p.onPointerDown} onContextMenu={p.onContextMenu}>
      <line className="ln-line" x1={x1} y1={y1} x2={x2} y2={y2} />
      <line className="ln-hit" x1={x1} y1={y1} x2={x2} y2={y2} />
      <g className="ln-label" onClick={p.onLabelClick}>
        <rect className="ln-label__box" x={lx} y={ly} width={w} height={LABEL_H} rx={3} />
        <text className="ln-label__text" x={lx + w / 2} y={ly + LABEL_H / 2}>{text}</text>
      </g>
    </g>
  );
}

export function CrossingDot({ x, y, hue, current }: CrossingDotProps): ReactElement {
  return <circle className={`ln-dot${current ? ' is-current' : ''}`} cx={x} cy={y} r={current ? 4.5 : 3.5} style={{ '--h': hue } as CSSProperties} />;
}

/* ---------- chart (HTML overlay, positioned inside the pane body) ---------- */

const ARROW: Record<EdgeTagProps['side'], string> = { right: '›', left: '‹', top: '˄', bottom: '˅' };

/** Shown when the line's value is outside this pane's visible range. Click pans the pane to it. */
export function EdgeTag({ side, offset, label, value, lit, onReveal, onHover }: EdgeTagProps): ReactElement {
  const pos: CSSProperties = side === 'left' || side === 'right' ? { top: offset } : { left: offset };
  const arrow = <span className="ln-edge__arrow" aria-hidden="true">{ARROW[side]}</span>;
  return (
    <button type="button" className={`ln-edge ln-edge--${side}${lit ? ' is-lit' : ''}`} style={pos}
      title={`${label} is at ${value}, outside this pane's range. Click to pan to it.`}
      onClick={onReveal} onMouseEnter={() => onHover?.(true)} onMouseLeave={() => onHover?.(false)}>
      {side === 'left' || side === 'top' ? arrow : null}{label} {value}{side === 'right' || side === 'bottom' ? arrow : null}
    </button>
  );
}
