import { useState } from 'react';
import type { TouchstoneFamily, TouchstoneView } from '../../types/touchstone';

export interface TouchstoneMatrixPickerProps {
  portCount: number;
  family: TouchstoneFamily;
  onToggle: (row: number, col: number, view: TouchstoneView) => void;
  view: TouchstoneView;
  cellColors?: Record<string, string>;
  selectedCell?: string | null;
  otherCells?: Readonly<Record<string, string>>;
  dark?: boolean;
  disabledReason?: (row: number, col: number) => string | undefined;
}

export function TouchstoneMatrixPicker({ portCount, family, onToggle, view, cellColors = {}, selectedCell = null, otherCells = {}, dark = false, disabledReason }: TouchstoneMatrixPickerProps) {
  const [row, setRow] = useState(1);
  const [col, setCol] = useState(1);
  const [showGrid, setShowGrid] = useState(false);
  const label = (r: number, c: number) => `${family}${r}${portCount >= 10 ? ',' : ''}${c}`;
  const grid = <div data-matrix style={{ display: 'grid', gap: 4, minWidth: portCount > 8 ? portCount * 35 : undefined }}>
    {Array.from({ length: portCount }, (_, r) => <div key={r} style={{ display: 'grid', gridTemplateColumns: `repeat(${portCount}, minmax(0, 1fr))`, gap: 4 }}>
      {Array.from({ length: portCount }, (_, c) => {
        const key = `${r + 1}:${c + 1}`;
        const color = cellColors[key];
        const reason = disabledReason?.(r, c);
        return <button data-testid={`touchstone-cell-${family}${r + 1}${c + 1}`} key={key} type="button" onClick={() => onToggle(r, c, view)} aria-pressed={!!color} disabled={!!reason}
          title={reason ?? `${label(r + 1, c + 1)} - ${view}`}
          onKeyDown={event => { const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? portCount : event.key === 'ArrowUp' ? -portCount : 0; if (!delta) return; event.preventDefault(); const buttons = Array.from(event.currentTarget.closest('[data-matrix]')?.querySelectorAll<HTMLButtonElement>('button[data-testid]') ?? []); buttons[Math.max(0, Math.min(buttons.length - 1, r * portCount + c + delta))]?.focus(); }}
          style={{ border: selectedCell === key ? '2px solid var(--accent)' : `1px solid ${color ? color : 'var(--border)'}`, background: color ? `color-mix(in srgb, ${color} 12%, var(--bg))` : dark ? 'var(--bg)' : 'var(--panel)', color: color ? 'var(--text)' : 'var(--text-muted)', fontSize: `${Math.max(9, 12 - Math.max(0, portCount - 2) * 0.5)}px`, fontFamily: 'var(--font-mono)', borderRadius: 4, padding: '3px 2px', minHeight: 26, cursor: reason ? 'not-allowed' : 'pointer', position: 'relative', fontWeight: color ? 700 : 400 }}>
          {otherCells[key] && <span aria-label="Also plotted elsewhere or in another view" style={{ position: 'absolute', right: 3, top: 3, width: 5, height: 5, borderRadius: '50%', background: otherCells[key] }} />}
          {label(r + 1, c + 1)}
        </button>;
      })}
    </div>)}
  </div>;
  if (portCount <= 8) return grid;
  const reason = disabledReason?.(row - 1, col - 1);
  return <div style={{ position: 'relative', display: 'grid', gap: 4 }}>
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      <label>Row <input type="number" min={1} max={portCount} value={row} onChange={e => setRow(Math.max(1, Math.min(portCount, Number(e.target.value))))} style={{ width: 48 }} /></label>
      <label>Column <input type="number" min={1} max={portCount} value={col} onChange={e => setCol(Math.max(1, Math.min(portCount, Number(e.target.value))))} style={{ width: 48 }} /></label>
      <button type="button" disabled={!!reason} title={reason} onClick={() => onToggle(row - 1, col - 1, view)}>+ Plot</button>
      <button type="button" aria-expanded={showGrid} onClick={() => setShowGrid(!showGrid)}>Grid&#8230;</button>
    </div>
    <div aria-label="Plotted parameters" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {Object.keys(cellColors).map(key => { const [r, c] = key.split(':').map(Number); if (!r || !c) return null; return <button key={key} type="button" title={`Remove ${label(r, c)} from target pane`} onClick={() => onToggle(r - 1, c - 1, view)}>{label(r, c)} &times;</button>; })}
    </div>
    {showGrid && <div role="dialog" aria-label="Full parameter grid" style={{ position: 'absolute', zIndex: 10, top: '100%', left: 0, width: 'min(80vw, 600px)', maxHeight: 400, overflow: 'auto', padding: 8, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--raised)', boxShadow: '0 4px 12px oklch(0 0 0 / .15)' }}><button type="button" onClick={() => setShowGrid(false)} aria-label="Close grid">&times;</button>{grid}</div>}
  </div>;
}
