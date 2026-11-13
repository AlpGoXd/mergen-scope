import { useMemo, useState } from 'react';
import { usePaneDispatch, usePaneState } from '../../stores/pane-store';
import { useTraceState } from '../../stores/trace-store';
import { linkGroupOf, linkMenuRows, linkedPeers, paneXUnits } from '../../domain/x-link';
import { paneName } from '../../domain/line-view';
import { Btn } from '../shared/Btn';
import { PopoverAt } from '../shared/Controls';
import { Menu as KitMenu } from '../left-panel/Menu';
import type { MenuEntry } from '../left-panel/Menu';

export function ChainIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <path d="M6 8a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-.75.75" />
      <path d="M8 6a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 6 11.5l.75-.75" />
    </svg>
  );
}

/**
 * The pane header's X link chip: chain icon + the pane's X unit ("Hz"). Neutral when the pane is unlinked,
 * tinted in the Pane hue when it is in a link group. Clicking opens "Link X with", a checklist of the other panes
 * in the shared popover layer; panes with another X unit are greyed with the reason.
 */
export function XLinkChip({ paneId, iconOnly }: { paneId: string; iconOnly: boolean }) {
  const { panes, tracePaneMap } = usePaneState();
  const { allKnownTraces } = useTraceState();
  const dispatch = usePaneDispatch();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const units = useMemo(() => paneXUnits(panes, allKnownTraces, tracePaneMap), [panes, allKnownTraces, tracePaneMap]);
  const unit = units[paneId] ?? null;
  if (unit === null) return null;
  const linked = linkGroupOf(panes, paneId) !== null;
  const peers = linkedPeers(panes, paneId).map(id => paneName(panes, id));
  const title = linked ? `X linked with ${peers.join(', ')}: zoom and pan move together` : 'X not linked: this pane zooms and pans on its own';
  const entries: MenuEntry[] = linkMenuRows(panes, units, paneId).map(row => ({
    id: row.paneId, label: row.label, checked: row.checked,
    ...(row.reason ? { note: row.reason, noteBelow: true, disabledReason: row.reason } : {}),
    onSelect: () => dispatch(row.checked
      ? { type: 'UNLINK_X_PANE', payload: { paneId: row.paneId } }
      : { type: 'LINK_X_PANES', payload: { paneId, otherId: row.paneId, units } }),
  }));
  if (linked) entries.push('separator', { id: 'unlink', label: 'Unlink', command: true, onSelect: () => { dispatch({ type: 'UNLINK_X_PANE', payload: { paneId } }); setAnchor(null); } });
  return <>
    <Btn variant="chip" active={linked} tone="pane" small className={`ph-link${iconOnly ? ' is-icon' : ''}`} data-testid={`x-link-chip-${paneId}`}
      aria-label={`X link (${unit}): ${linked ? `linked with ${peers.join(', ')}` : 'not linked'}`} aria-haspopup="menu" aria-expanded={anchor !== null} title={title}
      onClick={event => { event.stopPropagation(); const target = event.currentTarget; setAnchor(current => current ? null : target); }}>
      <ChainIcon />{!iconOnly && <span>{unit}</span>}
    </Btn>
    {anchor && <PopoverAt label="Link X with" at={anchor} onClose={() => setAnchor(null)}>
      <KitMenu label="Link X with" title="Link X with" checklist style={{ width: 240 }} entries={entries} />
    </PopoverAt>}
  </>;
}
