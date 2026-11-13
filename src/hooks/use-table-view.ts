import { useMemo } from 'react';
import { usePaneState } from '../stores/pane-store';
import { useTraceState } from '../stores/trace-store';
import { orderTracesForList } from '../domain/trace-order';
import { traceXGroup } from '../domain/pane-placement';
import { tableLinkedToChart, tableSettingsOf, tableVisibleRange } from '../domain/table-view';
import type { TableVisibleRange } from '../domain/table-view';
import type { TableSettings } from '../types/pane';
import type { Trace } from '../types/trace';

export interface TableView {
  readonly settings: TableSettings;
  /** Visible traces of this pane in Traces-list order, all with the same X unit. */
  readonly traces: readonly Trace[];
  readonly xGroup: string | null;
  readonly visible: TableVisibleRange;
}

/** What a Table pane shows: used by the table renderer and by the pane header and settings. */
export function useTableView(paneId: string): TableView {
  const { panes, tracePaneMap, zoomAll, sharedZoom } = usePaneState();
  const { allTraces, vis } = useTraceState();
  const pane = panes.find(item => item.id === paneId);
  const settings = tableSettingsOf(pane);
  const traces = useMemo(() => {
    const members = orderTracesForList(allTraces).filter(trace => (tracePaneMap[trace.name] ?? []).includes(paneId) && vis[trace.name] !== false);
    const group = members[0] ? traceXGroup(members[0]) : null;
    return members.filter(trace => traceXGroup(trace) === group);
  }, [allTraces, tracePaneMap, paneId, vis]);
  const xGroup = traces[0] ? traceXGroup(traces[0]) : null;
  const paneXGroups = useMemo(() => Object.fromEntries(panes.map(item => {
    const first = allTraces.find(trace => (tracePaneMap[trace.name] ?? []).includes(item.id));
    return [item.id, first ? traceXGroup(first) : null];
  })), [panes, allTraces, tracePaneMap]);
  const linked = tableLinkedToChart({ paneId, xGroup, zoomAll, panes, paneXGroups });
  const visible = tableVisibleRange({ linked, zoomAll, sharedZoom });
  return { settings, traces, xGroup, visible };
}
