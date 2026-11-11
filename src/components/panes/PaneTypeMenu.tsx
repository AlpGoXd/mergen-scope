import { Tooltip } from '../shared/Controls';
import { PaneTypeIcon } from './pane-type-icons';
import type { PaneTypeIconName } from './pane-type-icons';
import type { PickerTile, PickerTileId } from './PaneTypePicker';

/** What changing the type would do to the pane's traces; computed by the pane owner with the close-pane move rule. */
export interface TypeChangePlan {
  readonly to: PickerTileId;
  readonly toLabel: string;
  /** Names of traces that can't be shown, e.g. ["S21 · dB", "ƒ smoothed"]. Empty = nothing moves, no confirm. */
  readonly leaving: readonly string[];
  /** Where they go: "Pane 3, which has the same X unit" or null when they become "Not in a pane". */
  readonly destination: string | null;
}

/**
 * Content of the pane-type popover. Render it inside <PopoverAt at={chipButton} label="Pane type" …>.
 * Two states: the tile list, and (when `pending` is set) an inline confirm that replaces window.confirm.
 * Eye panes pass `lockedNote` instead of tiles.
 */
export function PaneTypeMenu({ paneName, current, tiles, note, pending, lockedNote, onChoose, onConfirm, onCancel }: {
  paneName: string;
  current: PickerTileId | 'eye';
  tiles: readonly PickerTile[];
  /** Optional line under the tiles, e.g. "Pane 1 shows 3 traces. Smith can only show S11 of them." */
  note?: string;
  pending?: TypeChangePlan;
  lockedNote?: string;
  onChoose: (id: PickerTileId) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (lockedNote) {
    return <div className="ptm"><span className="t-card-title">Pane type</span><span className="t-label ptm-text">{lockedNote}</span></div>;
  }
  if (pending && pending.leaving.length > 0) {
    const names = joinNames(pending.leaving);
    const verb = pending.leaving.length === 1 ? 'can’t' : 'can’t';
    const where = pending.destination ? `${pending.leaving.length === 1 ? 'It moves' : 'They move'} to ${pending.destination}.` : `${pending.leaving.length === 1 ? 'It will show' : 'They will show'} “Not in a pane”.`;
    return (
      <div className="ptm" role="alertdialog" aria-label={`Show ${paneName} as ${pending.toLabel}?`}>
        <span className="t-card-title">Show {paneName} as {pending.toLabel}?</span>
        <span className="t-label ptm-text">{names} {verb} be shown as {pending.toLabel}. {where}</span>
        <div className="ptm-actions">
          <button type="button" className="ui-btn ui-btn--neutral" onClick={onCancel}>Cancel</button>
          <button type="button" className="ui-btn ui-btn--solid" onClick={onConfirm} autoFocus>Show as {pending.toLabel}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="ptm">
      <span className="t-card-title">Pane type</span>
      <div className="ptm-grid" role="radiogroup" aria-label={`Pane type of ${paneName}`}>
        {tiles.map(t => {
          const off = t.state !== 'available';
          const selected = t.id === current;
          const b = (
            <button type="button" role="radio" aria-checked={selected} aria-disabled={off || undefined}
              className={`ptm-tile${selected ? ' is-selected' : ''}`}
              onClick={() => { if (!off && !selected) onChoose(t.id); }}>
              <PaneTypeIcon name={t.id as PaneTypeIconName} size={16} />
              <span>{t.label}</span>
            </button>
          );
          return <div className="ptm-cell" key={t.id}>{off ? <Tooltip text={t.reason ?? 'Not available yet'}>{b}</Tooltip> : b}</div>;
        })}
      </div>
      {note && <span className="t-caption">{note}</span>}
    </div>
  );
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}
