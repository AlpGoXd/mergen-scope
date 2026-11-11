import { forwardRef } from 'react';
import { PaneTypeIcon } from './pane-type-icons';
import type { PaneTypeIconName } from './pane-type-icons';

/**
 * The "pane type" control in a pane header: icon + type name, e.g. [chart] Chart.
 * It is not a dropdown (no ▾): it reads as the pane's type, and clicking it opens PaneTypeMenu
 * in the shared popover layer (PopoverAt, anchored to this button).
 * `compact` hides the name; the pane header sets it only after the scale text and trace count are gone.
 * `locked` (Eye panes) still opens the popover, which then only explains where the pane comes from.
 */
export const PaneTypeChip = forwardRef<HTMLButtonElement, {
  icon: PaneTypeIconName;
  label: string;
  open: boolean;
  compact?: boolean;
  onClick: () => void;
}>(function PaneTypeChip({ icon, label, open, compact = false, onClick }, ref) {
  return (
    <button ref={ref} type="button" className="ptc" data-compact={compact || undefined}
      aria-label={`Pane type: ${label}`} aria-haspopup="dialog" aria-expanded={open} onClick={onClick}>
      <PaneTypeIcon name={icon} size={14} />
      {!compact && <span className="ptc-label">{label}</span>}
    </button>
  );
});
