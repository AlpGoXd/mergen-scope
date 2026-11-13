import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { availablePresets } from '../../domain/pane-layout';
import type { PresetId } from '../../domain/pane-layout';
import { useAggregateWorkspace } from '../../stores/aggregate-workspace-store';
import { Btn } from '../shared/Btn';
import { PopoverAt } from '../shared/Controls';
import './pane-layout.css';

const labels: Record<PresetId, string> = { rows: 'Rows', columns: 'Columns', grid: '2 × 2', 'one-side': '1 + side' };
function Preview({ preset, count }: { preset: PresetId; count: number }) {
  const n = Math.max(1, count);
  return <svg viewBox="0 0 56 40" width="56" height="40" aria-hidden="true">{Array.from({ length: n }, (_, i) => {
    let x = 1, y = 1, width = 54, height = 38;
    if (preset === 'rows') { height = 38 / n; y += i * height; }
    else if (preset === 'columns') { width = 54 / n; x += i * width; }
    else if (preset === 'grid') { width = 27; height = 19; x += (i % 2) * width; y += Math.floor(i / 2) * height; }
    else if (i === 0) width = 32;
    else { x = 33; width = 22; height = 38 / Math.max(1, n - 1); y += (i - 1) * height; }
    return <g key={i}><rect x={x} y={y} width={Math.max(0, width - 1)} height={Math.max(0, height - 1)} /><text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="central">{i + 1}</text></g>;
  })}</svg>;
}
export function LayoutMenu({ paneCount, limit }: { paneCount: number; limit: 4 | 8 }) {
  const { state, dispatch } = useAggregateWorkspace();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const options = availablePresets(paneCount, limit);
  const current = paneCount === 1 ? 'rows' : state.layout.preset;
  const close = () => { setAnchor(null); anchor?.focus({ preventScroll: true }); };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-layout-tile]'));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(index + direction + buttons.length) % buttons.length]?.focus();
  };
  return <><Btn small disabled={!paneCount} aria-haspopup="dialog" aria-expanded={!!anchor} onClick={event => setAnchor(anchor ? null : event.currentTarget)}>Layout: {labels[current]} ▾</Btn>
    {anchor && <PopoverAt label="Layout" at={anchor} onClose={close}><div className="layout-menu" role="group" aria-label="Layout presets" onKeyDown={keyboard}>
      {options.map(option => <button type="button" key={option.preset} data-layout-tile data-autofocus={option.preset === current ? '' : undefined} className={`layout-menu__tile${option.preset === current ? ' is-selected' : ''}${!option.ok ? ' is-unavailable' : ''}`} aria-disabled={!option.ok} aria-pressed={option.preset === current} title={!option.ok ? option.reason : labels[option.preset]} onClick={() => { if (!option.ok) return; dispatch({ slice: 'layout', action: { type: 'SET_LAYOUT_PRESET', preset: option.preset, limit } }); close(); }}><Preview preset={option.preset} count={option.preset === 'grid' ? 4 : option.preset === 'one-side' ? Math.max(3, Math.min(4, paneCount)) : paneCount} /><span className="t-label">{labels[option.preset]}</span>{!option.ok && <span className="t-caption">{option.reason}</span>}</button>)}
    </div></PopoverAt>}</>;
}
