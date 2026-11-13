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
 * Range = Visible is offered only while the table is linked: shared zoom is on and another chart pane shows the
 * same X unit. `window` is null when the charts are not zoomed (then every row is visible).
 */
export function tableVisibleRange(input: {
  readonly linked: boolean;
  readonly zoomAll: boolean;
  readonly sharedZoom: ZoomWindow | null;
}): TableVisibleRange {
  const toRange = (zoom: ZoomWindow | null | undefined): XRange | null =>
    zoom && Number.isFinite(zoom.left) && Number.isFinite(zoom.right) && zoom.right > zoom.left ? { min: zoom.left, max: zoom.right } : null;
  if (input.linked && input.zoomAll) return { available: true, window: toRange(input.sharedZoom) };
  return { available: false, reason: VISIBLE_RANGE_REASON };
}

/** Whether a table is linked: shared zoom is on and another chart pane's traces use the table's X unit. */
export function tableLinkedToChart(input: {
  readonly paneId: string;
  readonly xGroup: string | null;
  readonly zoomAll: boolean;
  readonly panes: readonly Pick<Pane, 'id' | 'renderMode'>[];
  /** X unit group of each pane's traces (null when a pane has none). */
  readonly paneXGroups: Readonly<Record<string, string | null>>;
}): boolean {
  if (!input.zoomAll || !input.xGroup) return false;
  return input.panes.some(pane => pane.id !== input.paneId && pane.renderMode === 'cartesian' && input.paneXGroups[pane.id] === input.xGroup);
}
