import { useState } from 'react';
import { Btn } from '../shared/Btn';
import { PopoverAt } from '../shared/Controls';
import { Menu } from '../left-panel/Menu';

export function PaneActionsMenu({ onChangeChartType }: { onChangeChartType: () => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return <>
    <Btn variant="slate" active={anchor !== null} aria-label="Pane actions" aria-haspopup="menu" aria-expanded={anchor !== null} onClick={event => { event.stopPropagation(); setAnchor(anchor ? null : event.currentTarget); }}>⋯</Btn>
    {anchor && <PopoverAt label="Pane actions popup" at={anchor} onClose={() => { setAnchor(null); anchor.focus(); }}>
      <Menu label="Pane actions" entries={[{ label: 'Change chart type…', onSelect: () => { setAnchor(null); onChangeChartType(); } }]} />
    </PopoverAt>}
  </>;
}
