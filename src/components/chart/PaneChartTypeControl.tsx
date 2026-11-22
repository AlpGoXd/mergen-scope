import type { ComponentProps, RefObject } from 'react';
import { PaneTypeChip } from '../panes/PaneTypeChip';
import type { ChartTypeChipFit } from '../panes/PaneTypeChip';
import { PaneTypeMenu } from '../panes/PaneTypeMenu';
import { PopoverAt } from '../shared/Controls';

interface PaneChartTypeControlProps {
  buttonRef: RefObject<HTMLButtonElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  anchor: HTMLElement | null;
  fit: ChartTypeChipFit;
  icon: ComponentProps<typeof PaneTypeChip>['icon'];
  label: string;
  menu: Omit<ComponentProps<typeof PaneTypeMenu>, 'note'>;
  getNote: () => string | undefined;
  onToggle: () => void;
  onClose: () => void;
  onTileHover: (target: EventTarget | null) => void;
  onTileFocus: (target: EventTarget | null) => void;
}

export function PaneChartTypeControl({
  buttonRef, menuRef, anchor, fit, icon, label, menu, getNote, onToggle, onClose, onTileHover, onTileFocus,
}: PaneChartTypeControlProps) {
  return (
    <>
      <PaneTypeChip ref={buttonRef} icon={icon} label={label} open={!!anchor} fit={fit} onClick={onToggle} />
      {anchor && (
        <PopoverAt label="Chart type" at={anchor} onClose={onClose}>
          <div
            ref={menuRef}
            onMouseOver={event => onTileHover(event.target)}
            onMouseOut={event => onTileHover(event.relatedTarget)}
            onFocus={event => onTileFocus(event.target)}
            onBlur={event => onTileFocus(event.relatedTarget)}
          >
            <PaneTypeMenu {...menu} note={getNote()} />
          </div>
        </PopoverAt>
      )}
    </>
  );
}
