import { uiReducer } from '../ui-store';
import { canPlaceMembership, traceXGroup } from '../../domain/pane-placement';
import type { PlacementTrace } from '../../domain/pane-placement';
import { chooseOutputPane, extentOf } from '../../domain/output-placement';
import type { OutputPaneCandidate, XRange } from '../../domain/output-placement';
import { paneRangesOf } from '../../domain/analysis/instances';
import type { Trace } from '../../types/trace';
import type { WorkspaceState, WorkspaceAction } from './workspace-state';
import { traceView } from '../../domain/workspace/workspace-trace-view';

/** What the panes show, for analysis outputs whose Range is Visible. */
export function analysisView(state: WorkspaceState) {
  return { tracePaneMap: state.panes.tracePaneMap, paneRanges: paneRangesOf(state.lines.paneViews) };
}

/**
 * Place an analysis output whose x axis differs from its source's (the FFT of a time trace) in a pane of its own axis:
 * the first pane that already shows that axis, else an empty chart pane, else a new pane. X link groups only join
 * panes of one unit; a pane whose unit changes leaves its group (normalizeXLinks in workspaceReducer).
 */
/**
 * A created trace on another X axis (the FFT of a time trace) goes where it is visible right away
 * (domain/output-placement.ts): a chart pane on its axis whose visible X range overlaps it, else an empty
 * chart pane, else a new pane (unlinked), else the nearest pane on its axis with that pane's X fitted to it.
 */
export function placeOnOwnAxis(
  state: WorkspaceState,
  trace: Trace,
  limit: 4 | 8,
  workspaceReducer: (state: WorkspaceState, command: WorkspaceAction) => WorkspaceState,
): WorkspaceState {
  const view = traceView(state.files, state.traces);
  const entries: PlacementTrace[] = view.allKnownTraces.map(item => ({
    trace: item,
    paneIds: state.panes.tracePaneMap[item.name] ?? [],
    displayTrace: view.allDisplayTraces.find(display => display.id === item.id || display.id === item.parameters?.['displayTraceId']),
  }));
  const entry: PlacementTrace = entries.find(item => item.trace.id === trace.id) ?? { trace, paneIds: [] };
  const group = traceXGroup(trace);
  const members = (paneId: string) => entries.filter(item => item.trace.name !== trace.name && item.paneIds.includes(paneId));
  const panes = state.panes.panes;
  const visibleExtent = (paneId: string): XRange | null => {
    const zoom = state.panes.paneXZooms[paneId];
    if (zoom) return { min: Math.min(zoom.left, zoom.right), max: Math.max(zoom.left, zoom.right) };
    const pane = panes.find(item => item.id === paneId);
    const linked = pane?.xLinkGroup ? panes.filter(item => item.xLinkGroup === pane.xLinkGroup).map(item => item.id) : [paneId];
    let range: XRange | null = null;
    for (const id of linked) for (const item of members(id)) {
      if (state.traces.vis[item.trace.name] === false) continue;
      const extent = extentOf(item.trace.data);
      if (extent) range = range ? { min: Math.min(range.min, extent.min), max: Math.max(range.max, extent.max) } : extent;
    }
    return range;
  };
  const output = extentOf(trace.data);
  const candidates: OutputPaneCandidate[] = panes.map(pane => ({
    id: pane.id,
    chart: pane.renderMode === 'cartesian',
    empty: members(pane.id).length === 0,
    sameAxis: members(pane.id).some(item => traceXGroup(item.trace) === group)
      && canPlaceMembership(entry, pane.id, panes, entries).allowed,
    visible: visibleExtent(pane.id),
  }));
  const choice = output ? chooseOutputPane(candidates, output, panes.length < limit) : { kind: 'none' as const };
  let placed = state;
  if (choice.kind === 'join' || choice.kind === 'empty' || choice.kind === 'nearest') {
    placed = workspaceReducer(state, {
      slice: 'panes',
      action: { type: 'ADD_MEMBERSHIP', payload: { trace, targetPaneId: choice.paneId, allTraces: [trace] } },
      limit,
    });
    if (choice.kind === 'nearest' && (placed.panes.tracePaneMap[trace.name] ?? []).includes(choice.paneId)) {
      placed = workspaceReducer(placed, {
        slice: 'panes',
        action: { type: 'SET_PANE_ZOOM', payload: { paneId: choice.paneId, zoom: { left: choice.fitX.min, right: choice.fitX.max } } },
        limit,
      });
    }
    // A Y zoom that misses the new trace would hide it: let that pane's Y fit again.
    const yZoom = placed.panes.paneYZooms[choice.paneId];
    const amps = extentOf(trace.data.map(point => ({ freq: point.amp })));
    if (yZoom && amps && (amps.max < yZoom.min || amps.min > yZoom.max)) {
      placed = workspaceReducer(placed, {
        slice: 'panes',
        action: { type: 'SET_PANE_Y_ZOOM', payload: { paneId: choice.paneId, zoom: null } },
        limit,
      });
    }
  } else if (choice.kind === 'new') {
    placed = workspaceReducer(state, {
      slice: 'panes',
      action: { type: 'CREATE_PANE_WITH_TRACE', payload: { trace, allTraces: [trace] }, limit },
      limit,
    });
    // A new pane copies the target pane's type; the output needs a chart.
    const created = placed.panes.panes.find(pane => !panes.some(existing => existing.id === pane.id));
    if (created && created.renderMode !== 'cartesian') placed = {
      ...placed,
      panes: {
        ...placed.panes,
        panes: placed.panes.panes.map(pane => pane.id === created.id ? { ...pane, renderMode: 'cartesian' } : pane),
      },
    };
  }
  if ((placed.panes.tracePaneMap[trace.name] ?? []).length) return placed;
  const message = `${trace.dn || trace.name} needs a ${group === 'Hz' ? 'frequency' : group ?? 'separate'} pane and there is no room for a new one. Drag it from the trace list into a pane.`;
  return {
    ...state,
    ui: uiReducer(state.ui, {
      type: 'SET',
      payload: { key: 'paneAssignmentWarning', value: { message, paneId: null, traceName: trace.name } },
    }),
  };
}
