// ============================================================================
// Mergen Scope — Reference Line Intersection Computation
// ============================================================================

import { placeMarker } from './markers';
import { traceXGroup } from './pane-placement';
import type { PlacementPane, PlacementResult, PlacementTrace } from './pane-placement';
import { decodeXAxisUnit } from '../types/ref-line';
import type { Trace } from '../types/trace';
import type { RefLine } from '../types/ref-line';

export interface LineIntersection {
  traceName: string;
  paneId: string;
  freq: number;
  amp: number;
}

/** X groups use the same exact-unit normalization as trace placement. */
export function linePaneXGroup(paneId: string, entries: readonly PlacementTrace[]): string | null {
  const groups = entries.filter(entry => entry.paneIds.includes(paneId)).map(entry => traceXGroup(entry.trace));
  const first = groups[0];
  return first && groups.every(group => group === first) ? first : null;
}

export function linePlacementPanes(type: 'h' | 'v', paneId: string, panes: readonly PlacementPane[], entries: readonly PlacementTrace[], zoomAll: boolean): string[] {
  const group = linePaneXGroup(paneId, entries);
  if (type === 'h' || !zoomAll || !group) return [paneId];
  return panes.filter(pane => pane.id === paneId || linePaneXGroup(pane.id, entries) === group).map(pane => pane.id);
}

export function canSetLinePanes(line: RefLine, paneIds: readonly string[], panes: readonly PlacementPane[], entries: readonly PlacementTrace[]): PlacementResult {
  if (new Set(paneIds).size !== paneIds.length) return { allowed: false, reason: 'A pane may only be listed once.' };
  if (line.type === 'h' && paneIds.length > 1) return { allowed: false, reason: 'H lines belong to one pane.' };
  if (paneIds.some(id => !panes.some(pane => pane.id === id))) return { allowed: false, reason: 'The target pane no longer exists.' };
  if (paneIds.some(id => panes.find(pane => pane.id === id)?.renderMode === 'table')) return { allowed: false, reason: 'The target pane has no chart axis.' };
  if (line.type === 'v') {
    const anchor = line.axisUnit ? decodeXAxisUnit(line.axisUnit)[0] : line.paneIds.map(id => linePaneXGroup(id, entries)).find(Boolean);
    const groups = paneIds.map(id => linePaneXGroup(id, entries));
    const known = anchor ?? groups.find(Boolean);
    if (known && groups.some(group => group !== null && group !== known)) return { allowed: false, reason: 'The line and pane must have the same known X unit.' };
    if (groups.filter(group => group === null).length && paneIds.length > 1) return { allowed: false, reason: 'The line and pane must have the same known X unit.' };
  }
  return { allowed: true };
}

export function setLinePanes(line: RefLine, paneIds: readonly string[], panes: readonly PlacementPane[], entries: readonly PlacementTrace[]): { line: RefLine; result: PlacementResult } {
  const result = canSetLinePanes(line, paneIds, panes, entries);
  const unchanged = paneIds.length === line.paneIds.length && paneIds.every((id, index) => line.paneIds[index] === id);
  return { line: result.allowed && !unchanged ? { ...line, paneIds: [...paneIds] } : line, result };
}

export function addLinePane(line: RefLine, paneId: string, panes: readonly PlacementPane[], entries: readonly PlacementTrace[]): { line: RefLine; result: PlacementResult } {
  return setLinePanes(line, line.paneIds.includes(paneId) ? line.paneIds : [...line.paneIds, paneId], panes, entries);
}

export function removeLinePane(line: RefLine, paneId: string, axisUnit?: string | null): RefLine {
  const paneIds = line.paneIds.filter(id => id !== paneId);
  return paneIds.length === line.paneIds.length ? line : { ...line, paneIds, ...(paneIds.length === 0 && axisUnit !== undefined ? { axisUnit } : {}) };
}

/**
 * For a vertical line at x=value, resolve the intersection per trace using the
 * trace's own interpolation strategy (respects snap/linear/sinc).
 * - Snap traces: snapped to nearest sample (dot lands on actual data point)
 * - Linear/sinc traces: interpolated at exactly `value`
 */
export function computeVerticalIntersections(
  value: number,
  traces: readonly Trace[],
  paneId: string,
): LineIntersection[] {
  if (!Number.isFinite(value)) return [];
  const results: LineIntersection[] = [];
  for (const trace of traces) {
    if (!trace.data?.length) continue;
    const first = trace.data[0]!;
    const last = trace.data[trace.data.length - 1]!;
    if (value < Math.min(first.freq, last.freq) || value > Math.max(first.freq, last.freq)) continue;
    // placeMarker respects trace interpolation strategy:
    // snap → snaps to nearest sample; linear/sinc → interpolates at value
    const placement = placeMarker(trace, value);
    if (!Number.isFinite(placement.amp)) continue;
    // Use placement.freq (may differ from value for snap traces)
    results.push({ traceName: trace.name, paneId, freq: placement.freq, amp: placement.amp });
  }
  return results;
}

/**
 * For a horizontal line at y=value, find all crossings (zero-crossings of y−value)
 * for each trace using linear interpolation between adjacent samples.
 */
export function computeHorizontalIntersections(
  value: number,
  traces: readonly Trace[],
  paneId: string,
): LineIntersection[] {
  if (!Number.isFinite(value)) return [];
  const results: LineIntersection[] = [];
  for (const trace of traces) {
    const data = trace.data;
    if (!data?.length) continue;
    for (let i = 0; i < data.length - 1; i++) {
      const a = data[i]!;
      const b = data[i + 1]!;
      const ya = a.amp - value;
      const yb = b.amp - value;
      // Sign change (or exact hit)
      if (ya === 0) {
        results.push({ traceName: trace.name, paneId, freq: a.freq, amp: value });
        continue;
      }
      if (ya * yb < 0) {
        // Linear interpolation
        const t = ya / (ya - yb);
        const freq = a.freq + t * (b.freq - a.freq);
        results.push({ traceName: trace.name, paneId, freq, amp: value });
      }
    }
    // Check last point
    const last = data[data.length - 1]!;
    if (last.amp === value) {
      results.push({ traceName: trace.name, paneId, freq: last.freq, amp: value });
    }
  }
  return results;
}

/** Compute the same visible pane intersections used by chart reference-line markers. */
export function computeLineIntersections(
  line: RefLine, _lines: readonly RefLine[], traces: readonly Trace[],
  tracePaneMap: Readonly<Record<string, readonly string[]>>, vis: Readonly<Record<string, boolean>>,
): LineIntersection[] {
  return line.paneIds.flatMap(paneId => {
    const paneTraces = traces.filter(trace => vis[trace.name] && tracePaneMap[trace.name]?.includes(paneId));
    return line.type === 'v'
      ? computeVerticalIntersections(line.value, paneTraces, paneId)
      : computeHorizontalIntersections(line.value, paneTraces, paneId);
  });
}
