import type { PaneSettings, PaneRenderMode } from './pane';
import type { Marker } from './marker';
import type { RefLine } from './ref-line';
import type { WorkspaceSnapshot, WorkspaceFileRecord } from './workspace';
import type { WizardConfig, ColumnIdentity } from './file';
import type { DataPoint } from './trace';
import type { IP3Result } from '../domain/analysis/ip3';
import type { PeakTableRow, RangeStats } from '../domain/analysis/range-stats';
import type { BandwidthResult } from '../domain/analysis/bandwidth';
import type { RippleResult } from '../domain/analysis/ripple';

/** Persisted display controls; browser appearance and pane-limit preferences are excluded. */
export interface WorkspacePaneSettingsV5 extends PaneSettings {
  readonly showSampleDots: boolean;
  readonly showReadoutNames: boolean;
  readonly showZeroLine: boolean;
  readonly smith: {
    readonly grid: 'z' | 'y' | 'both';
    readonly labels: boolean;
    readonly direction: 'chevrons' | 'ends' | 'off';
    readonly readout: readonly ('z' | 'y' | 'gamma' | 'vswr' | 'return-loss')[];
  };
}
export interface WorkspacePaneV5 {
  readonly id: string; readonly title: string;
  readonly renderMode: PaneRenderMode | 'table';
  readonly settings: WorkspacePaneSettingsV5;
  readonly xLinkGroup: string | null;
}
export interface WorkspaceFileV5 extends WorkspaceFileRecord {
  readonly matrixOpen?: boolean;
  readonly wizardConfig?: WizardConfig;
  readonly columnIdentities?: readonly ColumnIdentity[];
  readonly rawText?: string;
}
export interface WorkspaceSessionUiV5 {
  readonly traceColors: Readonly<Record<string,string>>;
  readonly traceInterpolations: WorkspaceSnapshot['ui']['traceInterpolations'];
  readonly noiseFilter: string;
  readonly noiseSource: string | null;
  readonly ip3Gain: string;
}
export interface WorkspaceSnapshotV5 extends Omit<WorkspaceSnapshot, 'version' | 'files' | 'panes' | 'paneMode' | 'paneRenderModes' | 'traceAssignments' | 'ui' | 'markers' | 'refLines'> {
  readonly version: 5;
  readonly files: readonly WorkspaceFileV5[];
  readonly panes: readonly WorkspacePaneV5[];
  readonly traceAssignments: Readonly<Record<string, readonly string[]>>;
  readonly analysisResults: {
    readonly noiseResults: Readonly<Record<string, DataPoint[]>>;
    readonly ip3Results: Readonly<Record<string, IP3Result | null>>;
    readonly peakResults: Readonly<Record<string, PeakTableRow[]>>;
    readonly bandwidthResults: Readonly<Record<string, BandwidthResult | null>>;
    readonly rippleResults: Readonly<Record<string, RippleResult | null>>;
    readonly rangeStatsResults: Readonly<Record<string, RangeStats | null>>;
  };
  readonly layout: { readonly preset: 'rows' | 'columns' | 'grid' | 'one-side'; readonly paneOrder: readonly string[]; readonly sizes: Readonly<Record<string, number>> };
  readonly ui: WorkspaceSessionUiV5;
  readonly markers: readonly Marker[];
  readonly refLines: readonly RefLine[];
}
