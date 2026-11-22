import type { FileState } from '../file-store';
import type { TraceState } from '../trace-store';
import { paneReducer } from '../pane-store';
import type { PaneState } from '../pane-store';
import { markerReducer } from '../marker-store';
import type { MarkerState } from '../marker-store';
import type { RefLineState } from '../ref-line-store';
import { analysisReducer } from '../analysis-store';
import type { AnalysisState } from '../analysis-store';
import type { UiState } from '../ui-store';
import type { WorkspaceState } from './workspace-state';

/** A history entry retains real immutable slices, without browser preferences or transient tools. */
export interface WorkspaceMemento {
  readonly files: FileState;
  readonly traces: TraceState;
  readonly panes: PaneState;
  readonly markers: MarkerState['markers'];
  readonly lines: RefLineState['refLines'];
  readonly analysis: AnalysisState;
  readonly layout: WorkspaceState['layout'];
  readonly ui: Pick<UiState, 'traceColors' | 'traceHueSlots' | 'traceInterpolations' | 'noiseFilter' | 'noiseSource' | 'ip3Gain' | 'selectedTraceName'>;
}

/** Open-batch wizards and Edit columns are not workspace content: undo neither records nor restores them. */
function transientWizard(entry: FileState['wizardQueue'][number]): boolean {
  return !!entry.pendingBatch || entry.mode === 'edit';
}

export function captureWorkspace(state: WorkspaceState): WorkspaceMemento {
  const { traceColors, traceHueSlots, traceInterpolations, noiseFilter, noiseSource, ip3Gain, selectedTraceName } = state.ui;
  return {
    files: { ...state.files, wizardQueue: state.files.wizardQueue.filter(entry => !transientWizard(entry)) },
    traces: state.traces,
    panes: state.panes,
    markers: state.markers.markers,
    lines: state.lines.refLines,
    analysis: { ...state.analysis, highlightedPeak: null },
    layout: state.layout,
    ui: { traceColors, traceHueSlots, traceInterpolations, noiseFilter, noiseSource, ip3Gain, selectedTraceName },
  };
}

export function sameWorkspaceMemento(a: WorkspaceMemento, b: WorkspaceMemento): boolean {
  return a.files === b.files
    && a.traces === b.traces
    && a.panes === b.panes
    && a.markers === b.markers
    && a.lines === b.lines
    && sameValue(a.analysis, b.analysis)
    && a.layout === b.layout
    && a.ui.traceColors === b.ui.traceColors
    && a.ui.traceInterpolations === b.ui.traceInterpolations
    && a.ui.noiseFilter === b.ui.noiseFilter
    && a.ui.noiseSource === b.ui.noiseSource
    && a.ui.ip3Gain === b.ui.ip3Gain
    && a.ui.selectedTraceName === b.ui.selectedTraceName;
}

export function restoreWorkspaceMemento(state: WorkspaceState, memento: WorkspaceMemento): WorkspaceState {
  return {
    ...state,
    files: {
      ...memento.files,
      wizardQueue: [...memento.files.wizardQueue, ...state.files.wizardQueue.filter(transientWizard)],
    },
    traces: memento.traces,
    panes: paneReducer(state.panes, { type: 'RESTORE', payload: memento.panes }),
    markers: markerReducer(state.markers, {
      type: 'RESTORE',
      payload: { ...state.markers, markers: memento.markers, armed: null, selectedMkrIdx: -1 },
    }),
    lines: {
      ...state.lines,
      refLines: memento.lines,
      refMode: null,
      selectedRefLineId: null,
    },
    analysis: analysisReducer(state.analysis, { type: 'RESTORE', payload: memento.analysis }),
    ui: {
      ...state.ui,
      ...memento.ui,
      paneAssignmentWarning: null,
      activeWizard: null,
    },
    layout: memento.layout,
    revision: state.revision + 1,
  };
}

/** Recursive comparison short-circuits structurally shared samples and handles no-op wrapper copies. */
export function sameValue(a: unknown, b: unknown, seen = new WeakMap<object, object>()): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  if (seen.has(a)) return seen.get(a) === b;
  seen.set(a, b);
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return keysA.length === keysB.length
    && keysA.every(key => Object.prototype.hasOwnProperty.call(b, key)
      && sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], seen));
}
