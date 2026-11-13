import { useMemo } from 'react';
import { usePaneState } from '../stores/pane-store';
import { useTraceState } from '../stores/trace-store';
import { orderTracesForList } from '../domain/trace-order';
import { traceXGroup } from '../domain/pane-placement';
import { paneName } from '../domain/line-view';
import { tableFollowChoices, tableFollowedPane, tableLinkedToChart, tableSettingsOf, tableVisibleRange } from '../domain/table-view';
import type { TableVisibleRange } from '../domain/table-view';
import type { TableSettings } from '../types/pane';
import type { Trace } from '../types/trace';

export interface TableView {
  readonly settings: TableSettings;
  /** The pane whose traces the table lists (itself unless it follows another pane). */
  readonly sourcePaneId: string;
  /** The followed pane, or null for Own traces. */
  readonly followedPaneId: string | null;
  /** Panes this table can follow, with their display names ("Pane 1"). */
  readonly followChoices: readonly { readonly id: string; readonly label: string }[];
  /** Visible traces of the source pane in Traces-list order, all with the same X unit. */
  readonly traces: readonly Trace[];
  readonly xGroup: string | null;
  readonly visible: TableVisibleRange;
}

/** What a Table pane shows: used by the table renderer and by the pane header and settings. */
export function useTableView(paneId: string): TableView {
  const { panes, tracePaneMap, paneXZooms } = usePaneState();
  const { allTraces, vis } = useTraceState();
  const pane = panes.find(item => item.id === paneId);
  const settings = tableSettingsOf(pane);
  const followedPaneId = tableFollowedPane(panes, paneId, settings.follow);
  const sourcePaneId = followedPaneId ?? paneId;
  const followChoices = tableFollowChoices(panes, paneId).map(id => ({ id, label: paneName(panes, id) }));
  const traces = useMemo(() => {
    const members = orderTracesForList(allTraces).filter(trace => (tracePaneMap[trace.name] ?? []).includes(sourcePaneId) && vis[trace.name] !== false);
    const group = members[0] ? traceXGroup(members[0]) : null;
    return members.filter(trace => traceXGroup(trace) === group);
  }, [allTraces, tracePaneMap, sourcePaneId, vis]);
  const xGroup = traces[0] ? traceXGroup(traces[0]) : null;
  const paneXGroups = useMemo(() => Object.fromEntries(panes.map(item => {
    const first = allTraces.find(trace => (tracePaneMap[trace.name] ?? []).includes(item.id));
    return [item.id, first ? traceXGroup(first) : null];
  })), [panes, allTraces, tracePaneMap]);
  const linkedPaneId = tableLinkedToChart({ paneId, xGroup, panes, paneXGroups });
  const visible = tableVisibleRange({ followedPaneId, linkedPaneId, paneXZooms });
  return { settings, sourcePaneId, followedPaneId, followChoices, traces, xGroup, visible };
}
