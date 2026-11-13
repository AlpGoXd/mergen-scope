import type { PaneTypeId } from '../../types/registry-contract';
import type { ComponentType } from 'react';
import { SmithPaneContainer } from '../smith/SmithPaneContainer';

// ChartPane owns the existing chart body; Table will plug in here in step 2.
const renderers: Readonly<Record<PaneTypeId, ComponentType<{ paneId: string; fitRequest?: number }> | null>> = {
  chart: null, table: null, smith: SmithPaneContainer, polar: null, eye: null, spectrogram: null,
};

export function rendererFor(typeId: PaneTypeId): ComponentType<{ paneId: string; fitRequest?: number }> | null {
  return renderers[typeId];
}

// P2 adds the Table empty state.
export function emptyStateFor(typeId: PaneTypeId): { title: string; sentence: (filesOpen: boolean) => string } | null {
  if (typeId === 'smith') return { title: 'Empty Smith chart', sentence: () => 'Add reflection traces (S11, S22 …) from the matrix or the Traces list.' };
  return typeId === 'chart' ? { title: 'Empty chart', sentence: filesOpen => filesOpen ? 'Drop a file here, or show traces from the Traces list.' : 'Drop a file here.' } : null;
}
