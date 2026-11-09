// ============================================================================
// Mergen Scope — Reference Line Intersection Computation
// ============================================================================

import { placeMarker } from './markers';
import type { Trace } from '../types/trace';
import type { RefLine } from '../types/ref-line';

export interface LineIntersection {
  traceName: string;
  paneId: string;
  freq: number;
  amp: number;
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
  line: RefLine, lines: readonly RefLine[], traces: readonly Trace[],
  tracePaneMap: Readonly<Record<string, readonly string[]>>, vis: Readonly<Record<string, boolean>>,
): LineIntersection[] {
  const members = line.groupId ? lines.filter(item => item.groupId === line.groupId) : [line];
  return members.flatMap(member => {
    if (member.paneless) return [];
    const paneId = member.paneId ?? 'pane-1';
    const paneTraces = traces.filter(trace => vis[trace.name] && tracePaneMap[trace.name]?.includes(paneId));
    return member.type === 'v'
      ? computeVerticalIntersections(member.value, paneTraces, paneId)
      : computeHorizontalIntersections(member.value, paneTraces, paneId);
  });
}
