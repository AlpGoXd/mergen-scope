import { useEffect, useId, useRef, useState } from 'react';
import './editable-value.css';

/**
 * Bump the last shown digit of the first number in a text: "2.450 GHz" ↑ gives "2.451 GHz".
 * `large` moves ten of those steps. Returns null when the text has no number.
 */
export function stepNumericText(text: string, direction: 1 | -1, large = false): string | null {
  const match = /[-+−]?\d+(?:\.(\d+))?/.exec(text);
  if (!match) return null;
  const decimals = match[1]?.length ?? 0;
  const current = Number(match[0].replace('−', '-'));
  if (!Number.isFinite(current)) return null;
  const next = current + direction * (large ? 10 : 1) * 10 ** -decimals;
  const keepPlus = match[0].startsWith('+') && next >= 0;
  return `${text.slice(0, match.index)}${keepPlus ? '+' : ''}${next.toFixed(decimals)}${text.slice(match.index + match[0].length)}`;
}

export interface EditableValueProps {
  /** Text shown at rest, already formatted with its unit: "2.450 GHz". */
  readonly value: string;
  /** Text put in the field when editing starts. Defaults to `value`. */
  readonly editValue?: string;
  /** Accessible name, the same at rest and while editing: "M1 position". */
  readonly label: string;
  readonly disabled?: boolean;
  /** Save the text. Return a message to refuse it: the old value stays and the message shows under the field. */
  readonly onCommit: (text: string) => string | null | undefined | void;
  /** ↑ / ↓ while editing: return the next field text. Defaults to one step of the last shown digit (Shift = ten). */
  readonly onStep?: (text: string, direction: 1 | -1, large: boolean) => string | null;
  /** Where the message goes. "above" is for fields on the bottom edge of a clipped area. */
  readonly messageSide?: 'below' | 'above';
  readonly className?: string;
  readonly testId?: string;
}

/**
 * The one editable-value pattern (Smith range, marker and line values).
 * At rest it is plain Readout text with a faint dotted underline; hover adds a light background
 * and a 1 px border; click turns it into a field. Enter or blur saves, Esc cancels, ↑ / ↓ step.
 * Invalid text never moves the value: a caption-size message appears and the old value stays.
 */
export function EditableValue({ value, editValue, label, disabled = false, onCommit, onStep, messageSide = 'below', className = '', testId }: EditableValueProps) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const messageId = useId();
  const rest = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const refocus = useRef(false);
  const leaving = useRef(false);

  // A new value from outside (drag, undo, another control) clears a stale message.
  useEffect(() => { setMessage(null); }, [value]);
  useEffect(() => {
    if (editing) { field.current?.focus(); field.current?.select(); }
    else if (refocus.current) { refocus.current = false; rest.current?.focus({ preventScroll: true }); }
  }, [editing]);

  const start = (): void => {
    if (disabled) return;
    leaving.current = false;
    setRaw(editValue ?? value);
    setMessage(null);
    setEditing(true);
  };
  const close = (viaKeyboard: boolean): void => {
    leaving.current = true;
    refocus.current = viaKeyboard;
    setEditing(false);
  };
  /** Returns true when the field may close. */
  const save = (): boolean => {
    const text = raw.trim();
    if (text === (editValue ?? value).trim()) { setMessage(null); return true; }
    const refusal = onCommit(text);
    if (typeof refusal === 'string' && refusal) { setMessage(refusal); return false; }
    setMessage(null);
    return true;
  };

  const note = message ? <span id={messageId} className={`ev-msg ev-msg--${messageSide} t-caption`} role="alert" data-testid={testId ? `${testId}-message` : undefined}>{message}</span> : null;

  if (!editing) {
    return (
      <span className={`ev ${className}`.trim()}>
        <button ref={rest} type="button" className="ev-rest t-readout" aria-label={label} title={disabled ? undefined : 'Click to edit'} disabled={disabled}
          aria-describedby={message ? messageId : undefined} data-testid={testId}
          onClick={event => { event.stopPropagation(); start(); }}>{value}</button>
        {note}
      </span>
    );
  }
  return (
    <span className={`ev is-editing ${className}`.trim()} onClick={event => event.stopPropagation()}>
      <input ref={field} className="ev-input t-readout" aria-label={label} aria-invalid={message ? true : undefined} aria-describedby={message ? messageId : undefined}
        data-testid={testId} value={raw} spellCheck={false} autoComplete="off" style={{ width: `${Math.max(raw.length, 6) + 2}ch` }}
        onChange={event => { setRaw(event.target.value); setMessage(null); }}
        onBlur={() => { if (leaving.current) return; save(); close(false); }}
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key === 'Enter') { event.preventDefault(); if (save()) close(true); }
          else if (event.key === 'Escape') { event.preventDefault(); setMessage(null); close(true); }
          else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            const next = (onStep ?? stepNumericText)(raw, event.key === 'ArrowUp' ? 1 : -1, event.shiftKey);
            if (next !== null) { setRaw(next); setMessage(null); }
          }
        }} />
      {note}
    </span>
  );
}
