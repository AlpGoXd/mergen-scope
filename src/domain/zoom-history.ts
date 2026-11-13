/**
 * Previous zoom (Backspace): each pane's earlier X / Y zooms, recorded by watching the zoom state. A burst of
 * changes (wheel, drag) closer together than BURST_MS is one step, so Backspace undoes a gesture, not a wheel tick.
 */

export interface PaneZoom {
  readonly x: { readonly left: number; readonly right: number } | null;
  readonly y: { readonly min: number; readonly max: number } | null;
}

interface PaneEntry {
  readonly current: PaneZoom;
  /** When `current` last changed. */
  readonly changedAt: number;
  readonly previous: readonly PaneZoom[];
}

export type ZoomHistory = ReadonlyMap<string, PaneEntry>;

export const BURST_MS = 500;
export const MAX_STEPS = 50;

export function sameZoom(a: PaneZoom, b: PaneZoom): boolean {
  return (a.x === b.x || (!!a.x && !!b.x && a.x.left === b.x.left && a.x.right === b.x.right))
    && (a.y === b.y || (!!a.y && !!b.y && a.y.min === b.y.min && a.y.max === b.y.max));
}

/** Note the pane's zoom now; a change after a pause pushes the zoom it replaced. `restoring` records without pushing. */
export function recordZoom(history: ZoomHistory, paneId: string, zoom: PaneZoom, now: number, restoring = false): ZoomHistory {
  const entry = history.get(paneId);
  const next = new Map(history);
  if (!entry) { next.set(paneId, { current: zoom, changedAt: Number.NEGATIVE_INFINITY, previous: [] }); return next; }
  if (sameZoom(entry.current, zoom)) return history;
  const startsStep = !restoring && now - entry.changedAt > BURST_MS;
  const previous = startsStep ? [...entry.previous, entry.current].slice(-MAX_STEPS) : entry.previous;
  next.set(paneId, { current: zoom, changedAt: restoring ? Number.NEGATIVE_INFINITY : now, previous });
  return next;
}

/** The zoom Backspace goes back to, and the history without it; null when there is nothing to go back to. */
export function takePreviousZoom(history: ZoomHistory, paneId: string): { zoom: PaneZoom; history: ZoomHistory } | null {
  const entry = history.get(paneId);
  const zoom = entry?.previous[entry.previous.length - 1];
  if (!entry || !zoom) return null;
  const next = new Map(history);
  next.set(paneId, { ...entry, previous: entry.previous.slice(0, -1) });
  return { zoom, history: next };
}

/** Forget panes that no longer exist. */
export function pruneZoomHistory(history: ZoomHistory, paneIds: readonly string[]): ZoomHistory {
  const keep = new Set(paneIds);
  return [...history.keys()].every(id => keep.has(id)) ? history : new Map([...history].filter(([id]) => keep.has(id)));
}
