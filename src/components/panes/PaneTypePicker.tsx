import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Tooltip } from '../shared/Controls';
import { PaneTypeIcon } from './pane-type-icons';
import type { PaneTypeIconName } from './pane-type-icons';
import { pickerLayout } from './pane-picker-layout';
import type { PickerLayout } from './pane-picker-layout';

export type PickerTileId = 'chart' | 'table' | 'smith' | 'polar' | 'spectrogram';
export type PickerTileState = 'available' | 'later' | 'needs-data';

export interface PickerTile {
  readonly id: PickerTileId;
  readonly label: string;
  /** One line shown only in the L size. User-facing copy, not developer text. */
  readonly description: string;
  readonly state: PickerTileState;
  /** Shown in the tooltip when state is not 'available'. */
  readonly reason?: string;
}

/**
 * Default tiles in display order. The pane owner maps registry availability onto `state`/`reason`.
 * Eye is deliberately absent: an Eye pane is only ever opened by Analysis › Eye diagram.
 * This file is UTF-8 (… › ’). Keep it UTF-8 when editing, or these turn into "?".
 */
export const PICKER_TILES: readonly PickerTile[] = [
  { id: 'chart', label: 'Chart', description: 'Traces against X: frequency, time or anything else.', state: 'available' },
  { id: 'table', label: 'Table', description: 'Values in rows; can follow another pane’s cursor.', state: 'later', reason: 'Table panes come in the next step.' },
  { id: 'smith', label: 'Smith', description: 'Reflections (S11, S22 …) as impedance.', state: 'later', reason: 'Smith panes come in the Smith step.' },
  { id: 'polar', label: 'Polar', description: 'Magnitude against angle.', state: 'later', reason: 'Polar panes are planned.' },
  { id: 'spectrogram', label: 'Spectrogram', description: 'Many sweeps over time, level as colour.', state: 'needs-data', reason: 'Needs a spectrum series file (many sweeps over time).' },
];

const ICON_SIZE = { L: 24, M: 22, S: 16, I: 16 } as const;
const CAPTION: Record<PickerTileState, string> = { available: '', later: 'later', 'needs-data': 'needs data' };

export function PaneTypePicker({ tiles = PICKER_TILES, onPick, onOpenFile }: {
  tiles?: readonly PickerTile[];
  onPick: (id: PickerTileId) => void;
  onOpenFile: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<PickerLayout>({ size: 'M', cols: 3 });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const next = pickerLayout(el.clientWidth, el.clientHeight);
      setLayout(prev => (prev.size === next.size && prev.cols === next.cols ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Arrow keys move focus across the grid; Home/End jump to the ends. Disabled tiles still take focus (their reason is in the tooltip).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(grid.current?.querySelectorAll<HTMLButtonElement>('button.ptp-tile') ?? []);
    const i = buttons.findIndex(b => b === document.activeElement);
    if (i < 0) return;
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: layout.cols, ArrowUp: -layout.cols };
    let next = -1;
    if (e.key in step) next = i + (step[e.key] ?? 0);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = buttons.length - 1;
    const target = buttons[next];
    if (target) { e.preventDefault(); target.focus(); }
  };

  const { size, cols } = layout;
  const tile = (t: PickerTile) => {
    const off = t.state !== 'available';
    const button = (
      <button type="button" className="ptp-tile" aria-disabled={off || undefined}
        aria-label={size === 'I' ? t.label : undefined}
        onClick={() => { if (!off) onPick(t.id); }}>
        <PaneTypeIcon name={t.id as PaneTypeIconName} size={ICON_SIZE[size]} />
        {size !== 'I' && <span className="ptp-name">{t.label}</span>}
        {size === 'L' && <span className="ptp-desc">{off ? (t.reason ?? t.description) : t.description}</span>}
        {off && (size === 'L' || size === 'M') && <span className="ptp-caption">{CAPTION[t.state]}</span>}
      </button>
    );
    const tip = off ? (t.reason ?? CAPTION[t.state]) : size === 'I' ? t.label : '';
    return <div className="ptp-cell" key={t.id}>{tip ? <Tooltip text={off && size === 'I' ? `${t.label}: ${tip}` : tip}>{button}</Tooltip> : button}</div>;
  };

  return (
    <div ref={box} className="ptp" data-size={size}>
      <div className="ptp-inner" data-cols={cols}>
        {size === 'L' && <div className="ptp-head"><span className="t-title">What should this pane show?</span><span className="t-caption">Pick a type, or drop a file and the pane picks one that fits.</span></div>}
        {size === 'M' && <div className="ptp-head"><span className="t-card-title">What should this pane show?</span></div>}
        {size === 'S' && <div className="ptp-head"><span className="t-caption">Pick a type or drop a file</span></div>}
        <div ref={grid} className="ptp-grid" role="group" aria-label="Chart type" onKeyDown={onKeyDown}>
          {tiles.map(tile)}
          <div className="ptp-cell">
            {size === 'I'
              ? <Tooltip text="Open file…"><button type="button" className="ptp-tile ptp-tile--action" aria-label="Open file…" onClick={onOpenFile}><PaneTypeIcon name="open" size={16} /></button></Tooltip>
              : <button type="button" className="ptp-tile ptp-tile--action" onClick={onOpenFile}>
                  <PaneTypeIcon name="open" size={ICON_SIZE[size]} />
                  <span className="ptp-name">Open file{'…'}</span>
                  {size === 'L' && <span className="ptp-desc">Or drop one anywhere on the pane.</span>}
                </button>}
          </div>
        </div>
      </div>
    </div>
  );
}
