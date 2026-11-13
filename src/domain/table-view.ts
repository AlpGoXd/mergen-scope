// Which traces a Table pane shows and which X range "Range: Visible" uses. Pure, no React.
import type { ZoomWindow } from '../types/marker';
import type { Pane, TableSettings } from '../types/pane';
import { defaultTableSettings } from '../types/pane';
import type { XRange } from './table-rows';

export function tableSettingsOf(pane: Pick<Pane, 'settings'> | undefined): TableSettings {
  // Only known keys: older saves may still carry `rows` or `follow`.
  return { range: pane?.settings.table?.range === 'visible' ? 'visible' : defaultTableSettings().range };
}

/** X column heading: "Frequency", "Time", or "X" for anything else. */
export function tableXLabel(domain: string | null | undefined, xGroup: string | null): string {
  if (domain === 'frequency' || xGroup === 'Hz') return 'Frequency';
  if (domain === 'time' || xGroup === 's') return 'Time';
  return 'X';
}

export type TableVisibleRange =
  | { readonly available: true; readonly window: XRange | null }
  | { readonly available: false; readonly reason: string };

export const VISIBLE_RANGE_REASON = 'Needs a linked chart with the same X unit';

/**
 * Range = Visible is offered only while the table is X-linked to a chart pane with the same X unit (its link group).
 * The window is that pane's X zoom (every pane of a group holds the same zoom); null when it is not zoomed (every row is visible).
 */
export function tableVisibleRange(input: {
  /** A chart pane in the table's X link group (tableLinkedToChart), or null. */
  readonly linkedPaneId: string | null;
  readonly paneXZooms: Readonly<Record<string, ZoomWindow>>;
}): TableVisibleRange {
  const toRange = (zoom: ZoomWindow | null | undefined): XRange | null =>
    zoom && Number.isFinite(zoom.left) && Number.isFinite(zoom.right) && zoom.right > zoom.left ? { min: zoom.left, max: zoom.right } : null;
  if (input.linkedPaneId) return { available: true, window: toRange(input.paneXZooms[input.linkedPaneId]) };
  return { available: false, reason: VISIBLE_RANGE_REASON };
}

/**
 * The chart pane a table is X-linked to: one in the same X link group showing the table's X unit, else null.
 * Tables join a group with their header's link chip, like charts.
 */
export function tableLinkedToChart(input: {
  readonly paneId: string;
  readonly xGroup: string | null;
  readonly panes: readonly Pick<Pane, 'id' | 'renderMode' | 'xLinkGroup'>[];
  /** X unit group of each pane's traces (null when a pane has none). */
  readonly paneXGroups: Readonly<Record<string, string | null>>;
}): string | null {
  const group = input.panes.find(pane => pane.id === input.paneId)?.xLinkGroup ?? null;
  if (!group || !input.xGroup) return null;
  return input.panes.find(pane => pane.id !== input.paneId && pane.xLinkGroup === group && pane.renderMode === 'cartesian' && input.paneXGroups[pane.id] === input.xGroup)?.id ?? null;
}
