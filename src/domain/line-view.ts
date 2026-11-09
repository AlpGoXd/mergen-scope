import type { RefLine } from '../types/ref-line';
import type { LineIntersection } from './ref-lines';
import { canSetLinePanes, linePaneXGroup } from './ref-lines';
import { traceXGroup } from './pane-placement';
import type { PlacementPane, PlacementTrace } from './pane-placement';
import { decodeXAxisUnit, encodeXAxisUnit } from '../types/ref-line';

type View = { x: readonly [number, number] | null; y: readonly [number, number] | null };

export function lineView(
  line: RefLine,
  layout: readonly { id: string; title: string }[],
  views: Readonly<Record<string, View>>,
  intersections: readonly LineIntersection[],
  value: string,
) {
  const panes: string[] = [];
  const offView: string[] = [];
  layout.forEach((pane, index) => {
    if (!line.paneIds.includes(pane.id)) return;
    const label = `P${index + 1}`;
    panes.push(label);
    const range = views[pane.id]?.[line.type === 'v' ? 'x' : 'y'];
    if (range && (line.value < Math.min(...range) || line.value > Math.max(...range))) offView.push(label);
  });
  const count = intersections.filter(intersection => line.paneIds.includes(intersection.paneId)).length;
  return { value, panes, offView, crossings: line.paneIds.length ? `${count} ${count === 1 ? 'crossing' : 'crossings'}` : undefined };
}

/** Pane name as shown everywhere: its title, or "Pane N" by position when it has none. */
export function paneName(panes: readonly { id: string; title: string }[], paneId: string): string {
  const index = panes.findIndex(pane => pane.id === paneId);
  const pane = panes[index];
  return pane?.title || (index >= 0 ? `Pane ${index + 1}` : 'pane');
}

/** The axis unit a line has in a pane: Y unit for H lines, the encoded X group for V lines (null when mixed or unknown). */
export function linePaneAxisUnit(line: RefLine, paneId: string, entries: readonly PlacementTrace[]): string | null {
  const units = entries.filter(entry => entry.paneIds.includes(paneId)).map(({ trace }) => {
    if (line.type === 'h') return trace.units.y || null;
    const group = traceXGroup(trace);
    return group && trace.units.x ? encodeXAxisUnit(group, trace.units.x) : null;
  });
  const first = units[0];
  return first && units.every(unit => unit === first) ? first : null;
}

export interface LineShowInChoice { id: string; label: string; checked: boolean; disabledReason?: string; aside?: string }

/** The same checklist rows as a trace's Show in: every pane, ticked when the line is in it, greyed with the reason when it cannot go there. */
export function lineShowInChoices(line: RefLine, panes: readonly PlacementPane[], entries: readonly PlacementTrace[]): LineShowInChoice[] {
  return panes.map((pane) => {
    const checked = line.paneIds.includes(pane.id);
    const result = canSetLinePanes(line, checked ? line.paneIds : [...line.paneIds, pane.id], panes, entries);
    const reason = checked || result.allowed ? undefined : result.reason;
    const targetGroup = linePaneXGroup(pane.id, entries);
    const sourceGroup = line.axisUnit ? decodeXAxisUnit(line.axisUnit)[0] : line.paneIds.map(id => linePaneXGroup(id, entries)).find(Boolean);
    const targetUnit = entries.find(entry => entry.paneIds.includes(pane.id))?.trace.units.x;
    const sourceUnit = line.axisUnit ? decodeXAxisUnit(line.axisUnit)[1] : entries.find(entry => entry.paneIds.some(id => line.paneIds.includes(id)))?.trace.units.x;
    const aside = reason ? (pane.renderMode === 'table' || !targetGroup ? 'no X axis' : sourceGroup && targetGroup !== sourceGroup && targetUnit && sourceUnit ? `${targetUnit} ≠ ${sourceUnit}` : undefined) : undefined;
    const kind = { cartesian: 'Chart', smith: 'Smith', 'smith-inverted': 'Smith', table: 'Table' }[pane.renderMode];
    return { id: pane.id, label: `${paneName(panes, pane.id)} · ${kind}`, checked, ...(reason ? { disabledReason: reason } : {}), ...(aside ? { aside } : {}) };
  });
}
