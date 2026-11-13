// Menu surface used by the file ⋯ menu, the interpolation menu, the "Show in" checklist and the delta reference menu.
// Positioning, focus trapping and Escape are the app's shared popover (Phase 2); this is the presentation.
import type { CSSProperties, ReactElement, ReactNode } from 'react';

export interface MenuItem {
  /** Stable identity when labels can repeat or change. */
  id?: string;
  label: string;
  /** Small muted text after the label (e.g. "(2 traces)") or under it when `noteBelow`. */
  note?: string;
  noteBelow?: boolean;
  /** Right-aligned text (shortcut, "Hz ≠ s"). */
  aside?: string;
  checked?: boolean;
  /** A command inside a checklist, with the same alignment but no checkbox role. */
  command?: boolean;
  danger?: boolean;
  /** Disabled items stay visible with the reason as tooltip. */
  disabledReason?: string;
  onSelect?: () => void;
}
export type MenuEntry = MenuItem | 'separator';

export interface MenuProps {
  title?: string;
  entries: MenuEntry[];
  /** Shows the checkmark column (checklists such as "Show in"). */
  checklist?: boolean;
  footer?: ReactNode;
  style?: CSSProperties;
  label: string;
}

export function Menu({ title, entries, checklist, footer, style, label }: MenuProps): ReactElement {
  return (
    <div className="lp-menu" role="menu" aria-label={label} style={style}>
      {title ? <div className="lp-menu__title">{title}</div> : null}
      {entries.map((e, i) =>
        e === 'separator' ? (
          <div key={`sep-${i}`} className="lp-menu__sep" role="separator" />
        ) : (
          <button
            key={e.id ?? e.label}
            type="button"
            style={e.command && checklist ? { display: 'flex' } : undefined}
            role={checklist && !e.command ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={checklist && !e.command ? Boolean(e.checked) : undefined}
            aria-disabled={e.disabledReason ? true : undefined}
            title={e.disabledReason}
            className={`lp-menu__item${e.danger ? ' lp-menu__item--danger' : ''}`}
            onClick={e.disabledReason ? undefined : e.onSelect}
          >
            {checklist ? <span className="lp-menu__check">{e.checked ? '✓' : ''}</span> : null}
            <span className="lp-menu__body">
              <span>
                {e.label}
                {e.note && !e.noteBelow ? <span className="lp-menu__note"> {e.note}</span> : null}
              </span>
              {e.note && e.noteBelow ? <span className="lp-menu__note">{e.note}</span> : null}
            </span>
            {e.aside ? <span className="lp-menu__aside">{e.aside}</span> : null}
          </button>
        ),
      )}
      {footer ? <div className="lp-menu__foot">{footer}</div> : null}
    </div>
  );
}

/** Ready-made entries for the file ⋯ menu (C03). */
export function fileMenuEntries(opts: {
  /** The file was read as a table (any extension), so its import settings can be changed. */
  isTable: boolean; multiTrace: boolean;
  onInfo: () => void; onReplace: () => void; onImportSettings: () => void; onRename: () => void;
  onShowAll: () => void; onRemove: () => void;
}): MenuEntry[] {
  const entries: MenuEntry[] = [
    { label: 'Info', onSelect: opts.onInfo },
    { label: 'Replace file…', onSelect: opts.onReplace },
  ];
  if (opts.isTable) entries.push({ label: 'Import settings…', onSelect: opts.onImportSettings });
  entries.push({ label: 'Rename', onSelect: opts.onRename });
  if (opts.multiTrace) entries.push({ label: 'Show all · Hide all', onSelect: opts.onShowAll });
  entries.push('separator', { label: 'Remove file…', danger: true, onSelect: opts.onRemove });
  return entries;
}

/** Interpolation menu (C02): one-line explanations, ✓ on the current one, apply-to-file at the end. */
export const INTERP_ENTRIES: { value: string; label: string; note: string }[] = [
  { value: 'Auto', label: 'Auto', note: 'Exact where samples exist, linear between' },
  { value: 'Exact', label: 'Exact only', note: 'No in-between values; markers always snap' },
  { value: 'Lin', label: 'Linear', note: 'Straight line between samples' },
  { value: 'Near', label: 'Nearest', note: 'Value of the closest sample' },
  { value: 'Prev', label: 'Previous', note: 'Holds the sample to the left (steps)' },
  { value: 'Next', label: 'Next', note: 'Holds the sample to the right (steps)' },
  { value: 'Cub', label: 'Cubic spline', note: 'Smooth curve through samples' },
];
