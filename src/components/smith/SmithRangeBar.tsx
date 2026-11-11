import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { handleToHz, hzToHandle, parseRangeInput, rangeLabel } from '../../domain/smith/range';
import type { SmithRange } from '../../domain/smith/range';
import './smith-range.css';

export interface SmithRangeBarProps {
  readonly full: SmithRange;
  readonly range: SmithRange;
  readonly linkedLabel: string | null;
  readonly onChange: (range: SmithRange) => void;
  readonly onFull: () => void;
}

export function SmithRangeBar({ full, range, linkedLabel, onChange, onFull }: SmithRangeBarProps) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<'start' | 'stop' | null>(null);
  const latest = useRef<SmithRange>(range);
  const [preview, setPreview] = useState<SmithRange | null>(null);
  const [editing, setEditing] = useState<'start' | 'stop' | null>(null);
  const [raw, setRaw] = useState('');
  const [invalid, setInvalid] = useState(false);
  const shown = preview ?? range;
  const disabled = linkedLabel !== null;
  const setValue = (which: 'start' | 'stop', value: number, current: SmithRange): SmithRange => which === 'start'
    ? { ...current, startHz: Math.max(full.startHz, Math.min(current.stopHz, value)) }
    : { ...current, stopHz: Math.min(full.stopHz, Math.max(current.startHz, value)) };
  const position = (value: number) => hzToHandle(value, { left: 0, width: 100 }, full);
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag.current || !track.current) return;
    const rect = track.current.getBoundingClientRect();
    const next = setValue(drag.current, handleToHz(event.clientX, rect, full), latest.current);
    latest.current = next; setPreview(next);
  };
  const key = (event: KeyboardEvent<HTMLButtonElement>, which: 'start' | 'stop') => {
    const sign = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0;
    if (!sign) return;
    event.preventDefault();
    onChange(setValue(which, (which === 'start' ? range.startHz : range.stopHz) + sign * (full.stopHz - full.startHz) / 200 * (event.shiftKey ? 10 : 1), range));
  };
  const commit = () => {
    const parsed = parseRangeInput(raw);
    if (!editing || !parsed.ok || parsed.value < full.startHz || parsed.value > full.stopHz || (editing === 'start' ? parsed.value > range.stopHz : parsed.value < range.startHz)) { setInvalid(true); return; }
    onChange(setValue(editing, parsed.value, range)); setEditing(null); setInvalid(false);
  };
  const label = rangeLabel(shown, full);
  const [start = '', rest = ''] = label.split(' → ');
  const stop = rest.split(' of ')[0] ?? '';
  const fullLabel = rest.split(' of ')[1] ?? '';
  const valueControl = (which: 'start' | 'stop', text: string) => editing === which && !disabled
    ? <input autoFocus className={`smith-range-input t-readout${invalid ? ' is-invalid' : ''}`} aria-label={`Range ${which}`} aria-invalid={invalid} data-testid={`smith-range-${which}`} value={raw} onChange={event => { setRaw(event.target.value); setInvalid(false); }} onKeyDown={event => { if (event.key === 'Enter') commit(); if (event.key === 'Escape') { setEditing(null); setInvalid(false); } }} />
    : <button type="button" className="smith-range-value t-readout" data-testid={`smith-range-${which}`} disabled={disabled} onClick={() => { setRaw(String(which === 'start' ? range.startHz : range.stopHz)); setInvalid(false); setEditing(which); }}>{text}</button>;
  return <div className="smith-range t-caption" data-testid="smith-range-bar">
    <div className="smith-range-track" ref={track}>
      <div className="smith-range-fill" style={{ left: `${position(shown.startHz)}%`, right: `${100 - position(shown.stopHz)}%` }} />
      {(['start', 'stop'] as const).map(which => <button key={which} type="button" role="slider" className="smith-range-handle" data-testid={`smith-range-handle-${which}`} aria-label={`Range ${which}`} aria-valuemin={full.startHz} aria-valuemax={full.stopHz} aria-valuenow={which === 'start' ? shown.startHz : shown.stopHz} aria-disabled={disabled} disabled={disabled} style={{ left: `${position(which === 'start' ? shown.startHz : shown.stopHz)}%` }} onKeyDown={event => key(event, which)} onPointerDown={event => { if (event.button !== 0) return; drag.current = which; latest.current = range; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={move} onPointerUp={event => { if (!drag.current) return; move(event); drag.current = null; onChange(latest.current); setPreview(null); }} onPointerCancel={() => { drag.current = null; setPreview(null); }} />)}
    </div>
    <div className="smith-range-controls"><span data-testid="smith-range-label">{valueControl('start', start)} {'→'} {valueControl('stop', stop)} {'of'} {fullLabel}</span>
      {linkedLabel && <span data-testid="smith-range-linked">{linkedLabel}</span>}
      <button type="button" className="smith-range-value t-label" data-testid="smith-range-full" disabled={disabled} onClick={onFull}>Full range</button>
    </div>
  </div>;
}
