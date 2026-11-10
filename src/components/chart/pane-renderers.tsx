import type { PaneTypeId } from '../../types/registry-contract';
import type { ComponentType } from 'react';
import { ChartPane } from './ChartPane';

// ChartPane owns the existing chart body; Table will plug in here in step 2.
const renderers: Readonly<Record<PaneTypeId, ComponentType<{ paneId: string }> | null>> = {
  chart: ChartPane, table: null, smith: null, polar: null, eye: null, spectrogram: null,
};

export function rendererFor(typeId: PaneTypeId): ComponentType<{ paneId: string }> | null {
  return renderers[typeId];
}
