import { forwardRef } from 'react';
import { PaneTypeIcon } from './pane-type-icons';
import type { PaneTypeIconName } from './pane-type-icons';

/** How much of the control fits; the pane header picks it after the scale text and trace count are gone. */
export type ChartTypeChipFit = 'full' | 'value' | 'icon';

/**
 * The "Chart type" control in a pane header: [Chart type | (icon) Chart].
 * Not a dropdown (no ▾). Clicking opens ChartTypeMenu in the shared popover layer (PopoverAt, anchored here).
 * fit: 'full' shows the muted "Chart type" prefix, 'value' drops the prefix, 'icon' shows only the icon.
 * Shown on every pane that has a type, including a typed pane with no traces.
 */
export const PaneTypeChip = forwardRef<HTMLButtonElement, {
  icon: PaneTypeIconName;
  label: string;
  open: boolean;
  fit?: ChartTypeChipFit;
  onClick: () => void;
}>(function PaneTypeChip({ icon, label, open, fit = 'full', onClick }, ref) {
  return (
    <button ref={ref} type="button" className="ptc" data-compact={fit === 'icon' || undefined}
      aria-label={`Chart type: ${label}. Change chart type`} aria-haspopup="dialog" aria-expanded={open} onClick={onClick}>
      {fit === 'full' && <span className="ptc-prefix">Chart type</span>}
      <PaneTypeIcon name={icon} size={14} />
      {fit !== 'icon' && <span className="ptc-label">{label}</span>}
    </button>
  );
});
