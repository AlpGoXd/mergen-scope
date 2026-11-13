import type { Trace } from '../types/trace';
import type { Capability, DataKindDefinition, DataKindId } from '../types/registry-contract';

export const DATA_KIND_REGISTRY: Readonly<Record<DataKindId, DataKindDefinition>> = {
  spectrum: {
    id: 'spectrum',
    title: 'Spectrum',
    description: 'Frequency-domain scalar measurement data.',
    xDomain: 'frequency',
    xUnit: 'Hz',
  },
  waveform: {
    id: 'waveform',
    title: 'Waveform',
    description: 'Time-domain scalar measurement data.',
    xDomain: 'time',
    xUnit: 's',
  },
  network: {
    id: 'network',
    title: 'Network parameters',
    description: 'Frequency-domain network-parameter traces.',
    xDomain: 'frequency',
    xUnit: 'Hz',
  },
};

export type DataKindResolution =
  | { readonly allowed: true; readonly value: DataKindDefinition }
  | { readonly allowed: false; readonly reason: string };

export function resolveDataKind(trace: Trace): DataKindResolution {
  const family = trace.family;
  if (family === 'spectrum' || family === 'waveform' || family === 'network') {
    return { allowed: true, value: DATA_KIND_REGISTRY[family] };
  }
  const label = family === 'iq' ? 'IQ' : 'Symbol';
  const unavailable: Capability = { allowed: false, reason: `The ${label} data kind is not supported.` };
  return unavailable;
}

export function getDataKind(id: DataKindId): DataKindDefinition {
  return DATA_KIND_REGISTRY[id];
}
