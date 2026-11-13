import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { handleToHz, hzToHandle, parseRangeInput, rangeParts } from '../../domain/smith/range';
import type { SmithRange } from '../../domain/smith/range';
import { EditableValue } from '../shared/EditableValue';
import './smith-range.css';

export interface SmithRangeBarProps {
  readonly full: SmithRange;
  readonly range: SmithRange;
  readonly linkedLabel: string | null;
  readonly onChange: (range: SmithRange) => void;
  readonly onFull: () => void;
}

/**
 * The frequency range of a Smith pane as one quiet line under the chart:
 * "Range  7.324 GHz → 8.500 GHz  of 10 kHz–8.5 GHz   Full range", with a 2 px track above it.
 * The two values are editable (shared EditableValue); the handles drag and take arrow keys.
 */
export function SmithRangeBar({ full, range, linkedLabel, onChange, onFull }: SmithRangeBarProps) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<'start' | 'stop' | null>(null);
  const latest = useRef<SmithRange>(range);
  const [preview, setPreview] = useState<SmithRange | null>(null);
  const shown = preview ?? range;
  const disabled = linkedLabel !== null;
  const isFull = range.startHz <= full.startHz && range.stopHz >= full.stopHz;
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
  const text = rangeParts(shown, full);
  const commit = (which: 'start' | 'stop', raw: string): string | null => {
    const parsed = parseRangeInput(raw);
    if (!parsed.ok) return `Not a frequency. Try ${which === 'start' ? text.start : text.stop}`;
    if (parsed.value < full.startHz || parsed.value > full.stopHz) return `Outside ${text.full}`;
    if (which === 'start' && parsed.value > range.stopHz) return `Start must be at or below ${text.stop}`;
    if (which === 'stop' && parsed.value < range.startHz) return `Stop must be at or above ${text.start}`;
    onChange(setValue(which, parsed.value, range));
    return null;
  };
  const value = (which: 'start' | 'stop') => (
    <EditableValue label={`Range ${which}`} value={which === 'start' ? text.start : text.stop} disabled={disabled} messageSide="above"
      testId={`smith-range-${which}`} onCommit={raw => commit(which, raw)} />
  );
  return <div className="smith-range" data-testid="smith-range-bar">
    <div className="smith-range-track" ref={track}>
      <div className="smith-range-fill" style={{ left: `${position(shown.startHz)}%`, right: `${100 - position(shown.stopHz)}%` }} />
      {(['start', 'stop'] as const).map(which => <button key={which} type="button" role="slider" className="smith-range-handle" data-testid={`smith-range-handle-${which}`} aria-label={`Range ${which}`} aria-valuemin={full.startHz} aria-valuemax={full.stopHz} aria-valuenow={which === 'start' ? shown.startHz : shown.stopHz} aria-valuetext={which === 'start' ? text.start : text.stop} aria-disabled={disabled} disabled={disabled} style={{ left: `${position(which === 'start' ? shown.startHz : shown.stopHz)}%` }} onKeyDown={event => key(event, which)} onPointerDown={event => { if (event.button !== 0) return; drag.current = which; latest.current = range; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={move} onPointerUp={event => { if (!drag.current) return; move(event); drag.current = null; onChange(latest.current); setPreview(null); }} onPointerCancel={() => { drag.current = null; setPreview(null); }} />)}
    </div>
    <div className="smith-range-line t-caption">
      <span className="smith-range-word">Range</span>
      <span className="smith-range-text" data-testid="smith-range-label">{value('start')}<span className="smith-range-arrow" aria-hidden="true">{' → '}</span>{value('stop')}<span className="smith-range-of">{' of '}{text.full}</span></span>
      {linkedLabel && <span data-testid="smith-range-linked">{linkedLabel}</span>}
      <button type="button" className="smith-range-full t-caption" data-testid="smith-range-full" disabled={disabled || isFull} onClick={onFull}>Full range</button>
    </div>
  </div>;
}
