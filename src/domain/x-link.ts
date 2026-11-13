/**
 * Opt-in X linking (decided 11 Nov). Panes start unlinked; the user links panes with the header's link chip.
 * A group is the set of panes that share one `xLinkGroup` id, so a pane is in at most one group by construction.
 * Only panes with the same known X unit can be linked. Pure: no React, no store.
 */
import type { Trace } from '../types/trace';
import type { ZoomWindow } from '../types/marker';
import { traceXGroup } from './pane-placement';
import { paneName } from './line-view';

export interface LinkPane {
  readonly id: string;
  readonly title: string;
  readonly renderMode: string;
  readonly xLinkGroup?: string | null;
}
/** The X unit each pane shows ("Hz", "s", …), or null when it has no data or mixed units. */
export type PaneXUnits = Readonly<Record<string, string | null>>;
export type LinkCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** A pane's X unit: the one known unit all its traces share (charts, Smith and tables alike). */
export function paneXUnits(panes: readonly LinkPane[], traces: readonly Trace[], memberships: Readonly<Record<string, readonly string[]>>): Record<string, string | null> {
  return Object.fromEntries(panes.map(pane => {
    let unit: string | null = null;
    for (const trace of traces) {
      if (!(memberships[trace.name] ?? []).includes(pane.id)) continue;
      const group = traceXGroup(trace);
      if (group === null || (unit !== null && unit !== group)) return [pane.id, null];
      unit = group;
    }
    return [pane.id, unit];
  }));
}

/** "frequency (Hz)", "time (s)", or the unit itself. */
export function describeXUnit(unit: string): string {
  return unit === 'Hz' ? 'frequency (Hz)' : unit === 's' ? 'time (s)' : unit;
}

export function linkGroupOf(panes: readonly LinkPane[], paneId: string): string | null {
  return panes.find(pane => pane.id === paneId)?.xLinkGroup ?? null;
}

/** The other panes in this pane's group, in pane order; empty when the pane is unlinked. */
export function linkedPeers(panes: readonly LinkPane[], paneId: string): string[] {
  const group = linkGroupOf(panes, paneId);
  return group ? panes.filter(pane => pane.id !== paneId && pane.xLinkGroup === group).map(pane => pane.id) : [];
}

export function canLinkX(panes: readonly LinkPane[], units: PaneXUnits, paneId: string, otherId: string): LinkCheck {
  const pane = panes.find(item => item.id === paneId);
  const other = panes.find(item => item.id === otherId);
  if (!pane || !other || pane.id === other.id) return { ok: false, reason: 'Pick another pane' };
  const name = paneName(panes, other.id);
  const unit = units[pane.id] ?? null;
  const otherUnit = units[other.id] ?? null;
  if (unit === null) return { ok: false, reason: `${paneName(panes, pane.id)} has no X unit yet` };
  if (otherUnit === null) return { ok: false, reason: `${name} has no data yet` };
  if (otherUnit !== unit) return { ok: false, reason: `${name} shows ${describeXUnit(otherUnit)}` };
  return { ok: true };
}

/** The smallest "x1", "x2" … not used by any pane. */
export function newLinkGroupId(panes: readonly LinkPane[]): string {
  const used = new Set(panes.map(pane => pane.xLinkGroup).filter(Boolean));
  let n = 1;
  while (used.has(`x${n}`)) n++;
  return `x${n}`;
}

function withGroup<T extends LinkPane>(panes: readonly T[], ids: ReadonlySet<string>, group: string | null): T[] {
  return panes.map(pane => ids.has(pane.id) && (pane.xLinkGroup ?? null) !== group ? { ...pane, xLinkGroup: group } : pane);
}

/**
 * Keeps the group rules true: a member whose known X unit differs from its group's unit leaves it, and a group of
 * one dissolves. A member with no data (null unit) stays until it shows another unit.
 * Returns the same array when nothing changes.
 */
export function normalizeXLinks<T extends LinkPane>(panes: readonly T[], units?: PaneXUnits): readonly T[] {
  let next: readonly T[] = panes;
  if (units) {
    // A group's unit is the one most of its members show (ties: the first in pane order), so the pane that changed
    // leaves, not the ones that did not.
    const counts = new Map<string, Map<string, number>>();
    for (const pane of next) {
      const unit = units[pane.id] ?? null;
      if (!pane.xLinkGroup || unit === null) continue;
      const tally = counts.get(pane.xLinkGroup) ?? new Map<string, number>();
      tally.set(unit, (tally.get(unit) ?? 0) + 1);
      counts.set(pane.xLinkGroup, tally);
    }
    const groupUnit = new Map<string, string>();
    for (const [group, tally] of counts) {
      let best: string | null = null;
      for (const [unit, count] of tally) if (best === null || count > (tally.get(best) ?? 0)) best = unit;
      if (best !== null) groupUnit.set(group, best);
    }
    const leaving = new Set(next.filter(pane => {
      const unit = units[pane.id] ?? null;
      return pane.xLinkGroup && unit !== null && unit !== groupUnit.get(pane.xLinkGroup);
    }).map(pane => pane.id));
    if (leaving.size) next = withGroup(next, leaving, null);
  }
  const counts = new Map<string, number>();
  for (const pane of next) if (pane.xLinkGroup) counts.set(pane.xLinkGroup, (counts.get(pane.xLinkGroup) ?? 0) + 1);
  const alone = new Set(next.filter(pane => pane.xLinkGroup && (counts.get(pane.xLinkGroup) ?? 0) < 2).map(pane => pane.id));
  if (alone.size) next = withGroup(next, alone, null);
  return next;
}

/**
 * Links `otherId` into `paneId`'s group (a new group when `paneId` has none). `otherId` first leaves any group it was in.
 * Refused, with the reason, when the panes do not show the same X unit.
 */
export function linkXPanes<T extends LinkPane>(panes: readonly T[], units: PaneXUnits, paneId: string, otherId: string): { readonly ok: true; readonly panes: readonly T[]; readonly group: string } | { readonly ok: false; readonly reason: string } {
  const check = canLinkX(panes, units, paneId, otherId);
  if (!check.ok) return check;
  const group = linkGroupOf(panes, paneId) ?? newLinkGroupId(panes);
  return { ok: true, group, panes: normalizeXLinks(withGroup(panes, new Set([paneId, otherId]), group)) };
}

/** The pane leaves its group; a group left with one pane dissolves. */
export function unlinkXPane<T extends LinkPane>(panes: readonly T[], paneId: string): readonly T[] {
  if (!linkGroupOf(panes, paneId)) return panes;
  return normalizeXLinks(withGroup(panes, new Set([paneId]), null));
}

export interface LinkMenuRow {
  readonly paneId: string;
  readonly label: string;
  readonly checked: boolean;
  /** Set when the pane cannot be linked: "Pane 3 shows time (s)". */
  readonly reason?: string;
}

/** The "Link X with" checklist: every other pane, ticked when it is in this pane's group. */
export function linkMenuRows(panes: readonly LinkPane[], units: PaneXUnits, paneId: string): LinkMenuRow[] {
  const group = linkGroupOf(panes, paneId);
  return panes.filter(pane => pane.id !== paneId).map(pane => {
    const checked = group !== null && pane.xLinkGroup === group;
    const check = canLinkX(panes, units, paneId, pane.id);
    return { paneId: pane.id, label: paneName(panes, pane.id), checked, ...(!check.ok && !checked ? { reason: check.reason } : {}) };
  });
}

/**
 * Workspaces saved before 11 Nov linked every pane automatically (`zoomAll`). Each set of two or more panes
 * with the same X unit becomes one group (a Table then was linked to any chart of its unit). Every pane shows the
 * old shared zoom, as it did then.
 */
export function autoLinkByUnit<T extends LinkPane>(panes: readonly T[], units: PaneXUnits, sharedZoom: ZoomWindow | null): { readonly panes: T[]; readonly paneXZooms: Record<string, ZoomWindow> } {
  const byUnit = new Map<string, string[]>();
  for (const pane of panes) {
    const unit = units[pane.id] ?? null;
    if (unit !== null) byUnit.set(unit, [...(byUnit.get(unit) ?? []), pane.id]);
  }
  let next = panes.map(pane => (pane.xLinkGroup ?? null) === null ? pane : { ...pane, xLinkGroup: null });
  for (const ids of byUnit.values()) if (ids.length >= 2) next = withGroup(next, new Set(ids), newLinkGroupId(next));
  // With zoomAll on, the shared window replaced every pane's own zoom.
  const zooms: Record<string, ZoomWindow> = {};
  if (sharedZoom) for (const pane of panes) zooms[pane.id] = { ...sharedZoom };
  return { panes: next, paneXZooms: zooms };
}

/**
 * The X range a fitted pane shows: the data extent of its visible traces, or, for a linked pane, of every visible
 * trace in its group, so all panes of a group show the same range. Null when there is no data.
 */
export function fittedXBounds(paneIds: readonly string[], traces: readonly Pick<Trace, 'name' | 'data'>[], memberships: Readonly<Record<string, readonly string[]>>, vis: Readonly<Record<string, boolean>>): { min: number; max: number } | null {
  let min = Infinity, max = -Infinity;
  for (const trace of traces) {
    if (!vis[trace.name] || !(memberships[trace.name] ?? []).some(id => paneIds.includes(id))) continue;
    const first = trace.data[0]?.freq, last = trace.data[trace.data.length - 1]?.freq;
    if (first !== undefined && Number.isFinite(first)) min = Math.min(min, first);
    if (last !== undefined && Number.isFinite(last)) max = Math.max(max, last);
  }
  return Number.isFinite(min) && Number.isFinite(max) && max > min ? { min, max } : null;
}
