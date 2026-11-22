import { planPaneRemoval, traceXGroup } from '../pane-placement';
import { decodeXAxisUnit, encodeXAxisUnit } from '../../types/ref-line';
import type { WorkspaceState } from '../../stores/workspace/workspace-state';
import { traceView } from './workspace-trace-view';

/** The same projection is used for preview and execution. */
export function planLastPaneRemoval(state: WorkspaceState, targetPaneId: string) {
  const pane = state.panes.panes.at(-1);
  if (state.panes.panes.length <= 1 || pane?.id !== targetPaneId) return {
    ok: false as const,
    reason: 'The last pane changed; try again.',
  };
  return planWorkspacePaneRemoval(state, targetPaneId);
}

export function planWorkspacePaneRemoval(state: WorkspaceState, targetPaneId: string) {
  const view = traceView(state.files, state.traces);
  const entries = view.allKnownTraces.map(trace => ({
    trace,
    paneIds: state.panes.tracePaneMap[trace.name] ?? [],
    displayTrace: view.allDisplayTraces.find(display => display.id === trace.id || display.id === trace.parameters?.['displayTraceId']),
  }));
  return planPaneRemoval(state.panes.panes, entries, [targetPaneId]);
}

/** Preview line destinations using pre-removal source units and planned trace memberships. */
export function planLastPaneLines(state: WorkspaceState, targetPaneId: string, memberships: Record<string, readonly string[]>) {
  const traces = traceView(state.files, state.traces).allKnownTraces;
  const unitFor = (paneId: string, type: 'h' | 'v', map: Record<string, readonly string[]>) => {
    const members = traces.filter(trace => map[trace.name]?.includes(paneId));
    const units = members.map(trace => type === 'v'
      ? (trace.units.x && traceXGroup(trace) ? encodeXAxisUnit(traceXGroup(trace)!, trace.units.x) : null)
      : trace.units.y);
    return units.length && units[0] && units.every(unit => unit === units[0]) ? units[0] : null;
  };
  const pivot = state.panes.panes.findIndex(pane => pane.id === targetPaneId);
  const remaining = state.panes.panes
    .map((pane, index) => ({ pane, index }))
    .filter(item => item.pane.id !== targetPaneId)
    .sort((a, b) => Math.abs(a.index - pivot) - Math.abs(b.index - pivot) || a.index - b.index)
    .map(item => item.pane);
  return state.lines.refLines.filter(line => line.paneIds.includes(targetPaneId)).map(line => {
    const originalUnit = unitFor(targetPaneId, line.type, state.panes.tracePaneMap) ?? line.axisUnit ?? null;
    const axisUnit = originalUnit && line.type === 'v' ? encodeXAxisUnit(...decodeXAxisUnit(originalUnit)) : originalUnit;
    const sourceX = unitFor(targetPaneId, 'v', state.panes.tracePaneMap);
    const destination = axisUnit
      ? remaining.find(pane => unitFor(pane.id, line.type, memberships) === axisUnit
        && (line.type === 'v' || (sourceX !== null && unitFor(pane.id, 'v', memberships) === sourceX)))
      : undefined;
    return { line, to: destination?.id ?? null, axisUnit };
  });
}
