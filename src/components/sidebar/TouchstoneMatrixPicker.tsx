import { Fragment, useState } from 'react';
import type { TouchstoneFamily, TouchstoneView } from '../../types/touchstone';
import { PopoverAt, Tooltip } from '../shared/Controls';
import type { MatrixTrace } from '../../domain/matrix-add';
import { matrixCellTraces, planMatrixAdd } from '../../domain/matrix-add';

export interface TouchstoneMatrixPickerProps {
  portCount: number;
  family: TouchstoneFamily;
  onToggle: (row: number, col: number, view: TouchstoneView) => void;
  view: TouchstoneView;
  disabledReason?: (row: number, col: number) => string | undefined;
  traces?: readonly MatrixTrace[];
  targetPaneId?: string;
  targetPaneType?: string;
  targetPaneTitle?: string;
  paneTitle?: (id: string) => string;
}

export function TouchstoneMatrixPicker({ portCount, family, onToggle, view, disabledReason, traces = [], targetPaneId = 'pane-1', targetPaneType = 'cartesian', targetPaneTitle = 'Pane 1', paneTitle = id => id }: TouchstoneMatrixPickerProps) {
  const [row, setRow] = useState(1);
  const [col, setCol] = useState(1);
  const [gridAnchor, setGridAnchor] = useState<HTMLElement | null>(null);
  const label = (r: number, c: number) => `${family}${r}${portCount >= 10 ? ',' : ''}${c}`;
  const grid = <div data-matrix className="lp-grid" role="grid" aria-label="Parameters" style={{ gridTemplateColumns: `14px repeat(${portCount}, minmax(0, 1fr))`, minWidth: portCount > 8 ? portCount * 35 : undefined }}>
    <span />{Array.from({ length: portCount }, (_, c) => <span key={`c${c}`} className="lp-grid__index">{c + 1}</span>)}
    {Array.from({ length: portCount }, (_, r) => <Fragment key={r}>
      <span className="lp-grid__index">{r + 1}</span>
      {Array.from({ length: portCount }, (_, c) => {
        const key = `${r + 1}:${c + 1}`;
        const reason = disabledReason?.(r, c);
        const cell = matrixCellTraces(traces, family, r, c);
        const plan = planMatrixAdd({ family, row: r, col: c, view, targetPaneId, targetPaneType, traces });
        const name = `${label(r + 1, c + 1)} · ${view}`;
        const action = plan.kind === 'duplicate' ? `${name} is already in ${targetPaneTitle}: click to show it` : `Add ${name} to ${targetPaneTitle}`;
        const tooltip = [reason ?? action, ...cell.map(item => `${label(r + 1, c + 1)} · ${item.view} · ${item.paneIds.map(paneTitle).join(', ') || 'Not in a pane'}`)].join('\n');
        return <Tooltip key={key} text={tooltip}><button data-testid={`touchstone-cell-${family}${r + 1}${c + 1}`} type="button" role="gridcell" onClick={() => onToggle(r, c, view)} aria-label={action} aria-disabled={!!reason || undefined} disabled={!!reason}
          title={reason ?? action}
          onKeyDown={event => { const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? portCount : event.key === 'ArrowUp' ? -portCount : 0; if (!delta) return; event.preventDefault(); const buttons = Array.from(event.currentTarget.closest('[data-matrix]')?.querySelectorAll<HTMLButtonElement>('button[data-testid]') ?? []); buttons[Math.max(0, Math.min(buttons.length - 1, r * portCount + c + delta))]?.focus(); }}
          className={`lp-cell${r === c ? ' is-diag' : ''}${portCount > 4 ? ' is-small' : ''}`}
          >
          {label(r + 1, c + 1)}
          {cell.length > 0 && <span className="lp-cell__count">{cell.length}</span>}
        </button></Tooltip>;
      })}
    </Fragment>)}
  </div>;
  if (portCount <= 8) return grid;
  const reason = disabledReason?.(row - 1, col - 1);
  return <div style={{ position: 'relative', display: 'grid', gap: 4 }}>
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      <label>Row <input type="number" min={1} max={portCount} value={row} onChange={e => setRow(Math.max(1, Math.min(portCount, Number(e.target.value))))} style={{ width: 48 }} /></label>
      <label>Column <input type="number" min={1} max={portCount} value={col} onChange={e => setCol(Math.max(1, Math.min(portCount, Number(e.target.value))))} style={{ width: 48 }} /></label>
      <button type="button" disabled={!!reason} title={reason} onClick={() => onToggle(row - 1, col - 1, view)}>+ Add</button>
      <button type="button" aria-expanded={gridAnchor !== null} onClick={event => setGridAnchor(gridAnchor ? null : event.currentTarget)}>Grid&#8230;</button>
    </div>
    {gridAnchor && <PopoverAt label="Full parameter grid popup" at={gridAnchor} onClose={() => setGridAnchor(null)}><div role="dialog" aria-label="Full parameter grid" style={{ width: 'min(80vw, 600px)', maxHeight: 400, overflow: 'auto', padding: 8 }}><button type="button" onClick={() => setGridAnchor(null)} aria-label="Close grid">&times;</button>{grid}</div></PopoverAt>}
  </div>;
}
