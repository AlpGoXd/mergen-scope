import { useState } from 'react';
import { usePaneDispatch } from '../../stores/pane-store';
import { Btn } from '../shared/Btn';
import { PopoverAt } from '../shared/Controls';
import { Menu } from '../left-panel/Menu';

export function PaneActionsMenu({ paneId, showSampleDots }: { paneId: string; showSampleDots: boolean }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const dispatch = usePaneDispatch();
  return <>
    <Btn variant="slate" active={anchor !== null} aria-label="Pane actions" aria-haspopup="menu" aria-expanded={anchor !== null} onClick={event => { event.stopPropagation(); setAnchor(anchor ? null : event.currentTarget); }}>⋯</Btn>
    {anchor && <PopoverAt label="Pane actions popup" at={anchor} onClose={() => setAnchor(null)}>
      <Menu label="Pane actions" checklist entries={[{ label: 'Sample dots', checked: showSampleDots, onSelect: () => { dispatch({ type: 'SET_PANE_SETTINGS', payload: { paneId, patch: { showSampleDots: !showSampleDots } } }); setAnchor(null); } }]} />
    </PopoverAt>}
  </>;
}
