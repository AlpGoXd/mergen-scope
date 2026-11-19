import React from 'react';
import { useMarkerState, useMarkerDispatch } from '../../stores/marker-store';
import { useRefLineDispatch } from '../../stores/ref-line-store';
import { useInteractionMode } from '../../hooks/use-interaction-mode';
import { markerDisplayName } from '../../domain/footer-state';
import { shortcutText } from '../../domain/shortcuts';
import { Btn } from '../shared/Btn';
import { PopoverAt } from '../shared/Controls';
import { Menu } from '../left-panel/Menu';
import type { MenuEntry } from '../left-panel/Menu';
import '../left-panel/left-panel.css';

/**
 * The Markers group's one split button: "+ Marker" places a normal marker, "▾" chooses what the next click places
 * (a marker, or a delta from the selected or a named marker). While a delta is armed the face says which one.
 * The store actions and keys are unchanged; this is only the control.
 */
export function MarkerSplitButton() {
  const { markers, selectedMkrIdx, armed } = useMarkerState();
  const markerDispatch = useMarkerDispatch();
  const refDispatch = useRefLineDispatch();
  const { selectNormal } = useInteractionMode();
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const more = React.useRef<HTMLButtonElement>(null);

  const armDelta = (refId: string) => {
    refDispatch({ type: 'SET_MODE', payload: null });
    markerDispatch({ type: 'ARM', payload: { kind: 'delta', refId } });
  };
  const close = (returnFocus: boolean) => { setAnchor(null); if (returnFocus) more.current?.focus({ preventScroll: true }); };

  const selected = markers[selectedMkrIdx];
  const selectedIndex = selected && selected.type !== 'delta' ? selectedMkrIdx : -1;
  const hasNormal = markers.some(marker => marker.type !== 'delta');
  const reference = armed?.kind === 'delta' ? markers.findIndex(marker => marker.id === armed.refId) : -1;
  const face = armed?.kind === 'delta' ? (reference >= 0 ? `+ Δ from ${markerDisplayName(markers, reference)}` : '+ Δ marker') : '+ Marker';

  const selectedReason = hasNormal ? 'Select a normal marker first' : 'Place a marker first';
  const entries: MenuEntry[] = [
    { label: 'Marker', aside: shortcutText('new-marker'), onSelect: () => { selectNormal(); close(true); } },
    'separator',
    { heading: 'Delta from…' },
    {
      id: 'selected', label: selectedIndex >= 0 ? `Selected (${markerDisplayName(markers, selectedIndex)})` : 'Selected', aside: shortcutText('delta-marker'),
      ...(selectedIndex >= 0 ? {} : { disabledReason: selectedReason, note: selectedReason, noteBelow: true }),
      onSelect: () => { if (selected && selectedIndex >= 0) armDelta(selected.id); close(true); },
    },
    ...markers.flatMap((marker, index): MenuEntry[] => marker.type === 'delta' ? [] : [{ id: marker.id, label: markerDisplayName(markers, index), onSelect: () => { armDelta(marker.id); close(true); } }]),
  ];

  // Arrow keys move through the rows (disabled rows stay reachable so their reason can be read); Enter picks.
  const onMenuKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    if (!rows.length) return;
    event.preventDefault();
    const at = rows.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1
      : event.key === 'ArrowDown' ? (at < 0 ? 0 : (at + 1) % rows.length) : (at < 0 ? rows.length - 1 : (at - 1 + rows.length) % rows.length);
    rows[next]?.focus();
  };

  return <span className={`zone-tool split-btn${armed ? ' is-armed' : ''}${anchor ? ' is-open' : ''}`} style={{ '--armed-hue': 'var(--marker-hue)' } as React.CSSProperties}>
    <Btn small variant="armed" tone="marker" active={!!armed} aria-pressed={!!armed} aria-label="New Marker" title={`Place a marker (${shortcutText('new-marker')})`} className="split-btn__main" onClick={selectNormal}>{face}</Btn>
    <span className="split-btn__divider" aria-hidden="true" />
    <button type="button" ref={more} className="split-btn__more" aria-label="Choose marker type" title="Choose marker type" aria-haspopup="menu" aria-expanded={anchor !== null} onClick={event => setAnchor(anchor ? null : event.currentTarget)}>▾</button>
    {anchor && <PopoverAt label="Marker type" at={anchor} onClose={() => close(false)} onEscape={() => close(true)}>
      <div className="marker-menu" onKeyDown={onMenuKeys}><Menu label="Marker type" entries={entries} /></div>
    </PopoverAt>}
  </span>;
}
