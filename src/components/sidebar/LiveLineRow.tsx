import '../left-panel/left-panel.css';
import '../lines/lines.css';
import { useState } from 'react';
import { lineShowInChoices, linePaneAxisUnit, lineView, paneName } from '../../domain/line-view';
import type { LineIntersection } from '../../domain/ref-lines';
import type { PlacementPane, PlacementTrace } from '../../domain/pane-placement';
import { parseEngInput } from '../../domain/units';
import { decodeXAxisUnit } from '../../types/ref-line';
import type { RefLine } from '../../types/ref-line';
import type { Trace } from '../../types/trace';
import type { PaneView, RefLineAction } from '../../stores/ref-line-store';
import type { ToastKind } from '../../stores/toast-store';
import { formatRefLineValue, formatWithUnit, parseEngineeringInput } from './live-row-helpers';
import { LineRow, lineShowInEntries } from '../lines/Lines';
import { Menu } from '../left-panel/Menu';
import { PopoverAt } from '../shared/Controls';

export function LiveLineRow({ refLine, panes, entries, intersections, paneViews, selectedTrace, xSpan, lit, selected, onSelect, onHover, onList, changeLine }: {
  refLine: RefLine; panes: readonly PlacementPane[]; entries: readonly PlacementTrace[];
  intersections: readonly LineIntersection[]; paneViews: Readonly<Record<string, PaneView>>;
  selectedTrace: Trace | null; xSpan: number; lit: boolean; selected?: boolean;
  onSelect: () => void; onHover: (hovered: boolean) => void; onList: () => void;
  changeLine: (action: RefLineAction, message: string, toastKind?: ToastKind) => void;
}) {
  const [invalid, setInvalid] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const label = refLine.label ?? (refLine.type === 'v' ? 'V' : 'H');
  const savedUnit = refLine.paneIds.length === 0 && refLine.axisUnit ? (refLine.type === 'v' ? decodeXAxisUnit(refLine.axisUnit)[1] : refLine.axisUnit) : null;
  const value = savedUnit ? formatWithUnit(refLine.value, savedUnit) : formatRefLineValue(refLine, selectedTrace, xSpan);
  const view = lineView(refLine, panes, paneViews, intersections, value);
  const choices = lineShowInChoices(refLine, panes, entries);
  const toggle = (paneId: string) => {
    const pane = panes.find(item => item.id === paneId);
    if (!pane) return;
    if (refLine.paneIds.includes(paneId)) changeLine({ type: 'REMOVE_LINE_PANE', payload: { lineId: refLine.id, paneId, axisUnit: linePaneAxisUnit(refLine, paneId, entries) } }, `Removed ${label} from ${paneName(panes, paneId)}`);
    else changeLine({ type: 'ADD_LINE_PANE', payload: { lineId: refLine.id, paneId, panes, entries } }, `${label} also shown in ${paneName(panes, paneId)}`);
  };
  const suffix = refLine.paneIds.length > 1 ? ` from ${refLine.paneIds.length} panes` : refLine.paneIds.length === 1 ? ` from ${paneName(panes, refLine.paneIds[0] ?? '')}` : '';
  return <div data-testid={`ref-line-row-${label}`} data-value={refLine.value} onClick={event => { if (!(event.target instanceof Element) || !event.target.closest('button')) onSelect(); }}>
    <LineRow key={`${refLine.id}:${value}`} label={label} kind={refLine.type} {...view} lit={lit} selected={selected} invalid={invalid} menuOpen={!!anchor} onHover={onHover}
      onValue={text => { let result = savedUnit ? parseEngInput(text, { baseUnit: savedUnit }) : null; if (result && !result.ok && result.reason === 'unknown-unit' && savedUnit && text.trim().endsWith(savedUnit)) result = parseEngInput(text.trim().slice(0, -savedUnit.length)); const parsed = result ? (result.ok ? result.value : null) : parseEngineeringInput(text, selectedTrace); if (parsed == null || !Number.isFinite(parsed)) setInvalid(true); else { setInvalid(false); changeLine({ type: 'UPDATE_LINE', payload: { id: refLine.id, updates: { value: parsed } } }, 'Moved line'); } }}
      onPanes={element => { if (refLine.type === 'v') setAnchor(element); }} onListCrossings={onList} onRemove={() => changeLine({ type: 'REMOVE_LINE', payload: refLine.id }, `Deleted ${label}${suffix}`, 'delete')} />
    {anchor && <PopoverAt label="Show in" at={anchor} onClose={() => setAnchor(null)}><Menu label="Show in" title="Show in" checklist style={{ width: 220 }} entries={lineShowInEntries(choices, toggle)} /></PopoverAt>}
  </div>;
}
