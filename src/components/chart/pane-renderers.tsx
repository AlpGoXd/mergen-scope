import type { PaneTypeId } from '../../types/registry-contract';
import type { ComponentType } from 'react';
import { SmithPaneContainer } from '../smith/SmithPaneContainer';
import { TablePaneContainer } from '../panes/TablePaneContainer';

// ChartPane owns the existing chart body; Smith and Table render through here.
const renderers: Readonly<Record<PaneTypeId, ComponentType<{ paneId: string; fitRequest?: number }> | null>> = {
  chart: null, table: TablePaneContainer, smith: SmithPaneContainer, polar: null, eye: null, spectrogram: null,
};

export function rendererFor(typeId: PaneTypeId): ComponentType<{ paneId: string; fitRequest?: number }> | null {
  return renderers[typeId];
}

// The Table renderer draws its own empty state (it has buttons); this entry keeps the registry complete.
export function emptyStateFor(typeId: PaneTypeId): { title: string; sentence: (filesOpen: boolean) => string } | null {
  if (typeId === 'table') return { title: 'Empty table', sentence: () => 'Follow another pane’s traces and cursor, or add traces of your own.' };
  if (typeId === 'smith') return { title: 'Empty Smith chart', sentence: () => 'Add reflection traces (S11, S22 …) from the matrix or the Traces list.' };
  return typeId === 'chart' ? { title: 'Empty chart', sentence: filesOpen => filesOpen ? 'Drop a file here, or show traces from the Traces list.' : 'Drop a file here.' } : null;
}
