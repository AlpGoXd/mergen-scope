import { defaultFileState } from '../file-store';
import type { FileAction, FileState, PendingOpenInput } from '../file-store';
import { defaultTraceState } from '../trace-store';
import type { TraceAction, TraceState } from '../trace-store';
import { defaultPaneState } from '../pane-store';
import type { PaneAction, PaneState } from '../pane-store';
import { defaultMarkerState } from '../marker-store';
import type { MarkerAction, MarkerState } from '../marker-store';
import { defaultRefLineState } from '../ref-line-store';
import type { RefLineAction, RefLineState } from '../ref-line-store';
import { defaultAnalysisState } from '../analysis-store';
import type { AnalysisAction, AnalysisState } from '../analysis-store';
import { getInitialUiState, readThemePreference } from '../ui-store';
import type { UiAction, UiState } from '../ui-store';
import type { WorkspaceSnapshotV5 } from '../../types/workspace-v5';
import type { PresetId } from '../../domain/pane-layout';

export interface WorkspaceState {
  files: FileState;
  traces: TraceState;
  panes: PaneState;
  markers: MarkerState;
  lines: RefLineState;
  analysis: AnalysisState;
  ui: UiState;
  layout: WorkspaceSnapshotV5['layout'];
  revision: number;
}

type SliceAction =
  | { slice: 'files'; action: FileAction; limit?: 4 | 8 }
  | { slice: 'traces'; action: TraceAction }
  | { slice: 'panes'; action: PaneAction; limit: 4 | 8 }
  | { slice: 'markers'; action: MarkerAction }
  | { slice: 'lines'; action: RefLineAction }
  | { slice: 'analysis'; action: AnalysisAction }
  | { slice: 'ui'; action: UiAction };

export type OpenDataCommand = PendingOpenInput;

export type WorkspaceAction =
  | {
      slice: 'layout';
      action:
        | { type: 'SWAP_PANES'; sourcePaneId: string; targetPaneId: string }
        | { type: 'SET_LAYOUT_PRESET'; preset: PresetId; limit: 4 | 8 }
        | { type: 'SET_LAYOUT_SIZES'; sizes: Readonly<Record<string, number>> }
        | { type: 'ADD_PANE_AFTER'; targetPaneId: string; limit: 4 | 8 };
    }
  | { slice: 'remove-last-pane'; targetPaneId: string; expectedRevision: number; confirmed: boolean; limit: 4 | 8 }
  | { slice: 'remove-empty-pane'; targetPaneId: string; expectedRevision: number; confirmed: boolean; limit: 4 | 8 }
  | { slice: 'remove-pane'; targetPaneId: string; expectedRevision: number; confirmed: boolean; limit: 4 | 8 }
  | {
      slice: 'open-data';
      inputs: readonly OpenDataCommand[];
      targetPaneId?: string;
      drop?: boolean;
      limit: 4 | 8;
      resolveWizardId?: string;
      resolveBatchId?: string;
      workspace?: {
        readonly snapshot: WorkspaceSnapshotV5;
        readonly legacy: boolean;
        readonly choice?: 'replace' | 'cancel';
      };
    }
  | SliceAction
  | { slice: 'restore'; state: WorkspaceState }
  | { slice: 'transaction'; actions: readonly SliceAction[] }
  | { slice: 'deleteTrace'; traceId: string }
  | { slice: 'load'; snapshot: WorkspaceSnapshotV5; legacy: boolean; limit?: 4 | 8 };

export function initialWorkspaceState(): WorkspaceState {
  return {
    files: defaultFileState,
    traces: defaultTraceState,
    panes: defaultPaneState,
    markers: defaultMarkerState,
    lines: defaultRefLineState,
    analysis: defaultAnalysisState,
    ui: getInitialUiState(readThemePreference()),
    layout: { preset: 'rows', paneOrder: ['pane-1'], sizes: {} },
    revision: 0,
  };
}
