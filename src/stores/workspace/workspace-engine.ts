import { allocateColourBlindCreated } from '../../domain/trace-colors';
import {
  createTransactionHistory,
  recordTransaction,
  undoTransaction,
  redoTransaction,
} from '../../domain/transaction-history';
import type { TransactionHistory } from '../../domain/transaction-history';
import type { ToastKind } from '../toast-store';
import { initialWorkspaceState } from './workspace-state';
import type { WorkspaceState, WorkspaceAction } from './workspace-state';
import { traceView } from '../../domain/workspace/workspace-trace-view';
import { captureWorkspace, restoreWorkspaceMemento, sameValue } from './workspace-memento';
import type { WorkspaceMemento } from './workspace-memento';
import { workspaceReducer } from './workspace-reducer';

export interface WorkspaceEngine {
  readonly present: WorkspaceState;
  readonly history: TransactionHistory<WorkspaceMemento>;
  readonly gesture: WorkspaceMemento | null;
  readonly historyNotice: 'oversized' | 'pruned' | null;
  readonly toastMessage?: string;
}

export type WorkspaceEngineAction =
  | { type: 'change'; command: WorkspaceAction; record?: boolean; toastMessage?: string; toastKind?: ToastKind }
  | { type: 'undo' | 'redo' | 'begin-gesture' | 'commit-gesture' | 'cancel-gesture' | 'clear-notice' };

export function initialWorkspaceEngine(): WorkspaceEngine {
  return { present: initialWorkspaceState(), history: createTransactionHistory<WorkspaceMemento>(), gesture: null, historyNotice: null };
}

function recordable(command: WorkspaceAction): boolean {
  if (command.slice === 'layout') return true;
  if (command.slice === 'remove-last-pane'
    || command.slice === 'remove-empty-pane'
    || command.slice === 'remove-pane'
    || command.slice === 'open-data'
    || command.slice === 'transaction'
    || command.slice === 'restore'
    || command.slice === 'deleteTrace'
    || command.slice === 'load') return true;
  if (command.slice === 'files') return true;
  if (command.slice === 'traces') return command.action.type !== 'RECONCILE';
  if (command.slice === 'panes') return command.action.type !== 'RECONCILE';
  if (command.slice === 'markers') return !['ARM', 'SET_TRACE', 'SET_SELECTED_IDX'].includes(command.action.type);
  if (command.slice === 'lines') return ![
    'SET_MODE',
    'SET_SELECTED',
    'SET_HOVERED',
    'SET_PANE_VIEW',
    'CLEANUP_ORPHANED_LINES',
  ].includes(command.action.type);
  if (command.slice === 'analysis') return command.action.type !== 'SET_HIGHLIGHTED_PEAK';
  if (command.slice === 'ui') return command.action.type === 'SET'
    && ['traceColors', 'traceInterpolations', 'noiseFilter', 'noiseSource', 'ip3Gain'].includes(command.action.payload.key);
  return false;
}

export function workspaceEngineReducer(engine: WorkspaceEngine, action: WorkspaceEngineAction): WorkspaceEngine {
  if (action.type === 'clear-notice') return { ...engine, historyNotice: null, toastMessage: undefined };
  if (action.type === 'begin-gesture') return engine.gesture ? engine : { ...engine, gesture: captureWorkspace(engine.present) };
  if (action.type === 'cancel-gesture') return engine.gesture
    ? { ...engine, present: restoreWorkspaceMemento(engine.present, engine.gesture), gesture: null }
    : engine;
  if (action.type === 'commit-gesture') {
    if (!engine.gesture) return engine;
    const result = recordTransaction(engine.history, engine.gesture, captureWorkspace(engine.present), sameValue);
    // A new action normally clears redo; only past entries were evicted by the limit.
    return {
      ...engine,
      gesture: null,
      history: result.history,
      historyNotice: result.outcome === 'oversized' ? 'oversized' : result.prunedPast ? 'pruned' : null,
    };
  }
  if (action.type === 'undo' || action.type === 'redo') {
    const current = engine.gesture ? restoreWorkspaceMemento(engine.present, engine.gesture) : engine.present;
    const moved = action.type === 'undo'
      ? undoTransaction(engine.history, captureWorkspace(current))
      : redoTransaction(engine.history, captureWorkspace(current));
    return {
      ...engine,
      present: moved.state ? restoreWorkspaceMemento(current, moved.state) : current,
      history: moved.history,
      gesture: null,
      historyNotice: moved.outcome === 'moved-pruned' ? 'pruned' : null,
      toastMessage: undefined,
    };
  }
  if (action.type !== 'change') return engine;
  const reduced = workspaceReducer(engine.present, action.command);
  const slots = Object.fromEntries(allocateColourBlindCreated(
    traceView(reduced.files, reduced.traces).allKnownTraces,
    new Map(Object.entries(reduced.ui.traceHueSlots))
  ));
  const next = sameValue(slots, reduced.ui.traceHueSlots) ? reduced : { ...reduced, ui: { ...reduced.ui, traceHueSlots: slots } };
  if (next === engine.present) return engine;
  if (engine.gesture || !(action.record ?? recordable(action.command))) return { ...engine, present: next };
  const result = recordTransaction(engine.history, captureWorkspace(engine.present), captureWorkspace(next), sameValue);
  // A toast is raised only for the kinds in the toast policy; any other change stays silent.
  let toastMessage = action.toastKind ? action.toastMessage : undefined;
  if (action.command.slice === 'open-data') {
    const ids = new Set(action.command.inputs.map(input => input.id));
    const opened = next.files.files.filter(file => ids.has(String(file.id)) && !file.error).length;
    const failed = Math.max(0, next.files.importErrors.length - engine.present.files.importErrors.length);
    toastMessage = opened || failed || action.command.workspace
      ? [
        action.command.workspace ? 'Opened workspace' : '',
        opened ? `Opened ${opened} file${opened === 1 ? '' : 's'}` : '',
        failed ? `${failed} failed` : '',
      ].filter(Boolean).join(' - ')
      : undefined;
  }
  return {
    present: next,
    history: result.history,
    gesture: null,
    historyNotice: result.outcome === 'oversized' ? 'oversized' : result.prunedPast ? 'pruned' : null,
    toastMessage: result.outcome === 'noop' ? undefined : toastMessage,
  };
}
