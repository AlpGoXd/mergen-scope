import type { ComplexMatrix } from './touchstone';
import type { XUnit, YUnit } from './units';
import {
  DEFAULT_DATASET_CAPABILITIES,
  resolveDatasetCapabilities,
  mergeDatasetCapabilities,
} from '../domain/dataset-capabilities';

export type DatasetFamily = 'spectrum' | 'network' | 'waveform' | 'iq' | 'symbol';
export type DatasetKind = 'source' | 'derived';
export type DatasetBasis = 'single-ended' | 'mixed-mode';
export type NetworkParameterFamily = 'S' | 'Z' | 'Y' | 'ABCD' | 'H' | 'G' | 'T';

export interface TransformStep {
  readonly id: string;
  readonly kind:
    | 'import'
    | 'network-conversion'
    | 'mixed-mode-conversion'
    | 'renormalization'
    | 'deembedding'
    | 'resample'
    | 'fft'
    | 'trace-math'
    | 'other';
  readonly label: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly inputDatasetIds: readonly string[];
  readonly inputDisplayTraceIds?: readonly string[];
}

export interface Provenance {
  readonly rootDatasetIds: readonly string[];
  readonly transformSteps: readonly TransformStep[];
}

export interface DatasetCapabilities {
  readonly supportsSmithView: boolean;
  readonly supportsPolarView: boolean;
  readonly supportsGroupDelay: boolean;
  readonly supportsStabilityAnalysis: boolean;
  readonly supportsEyeDiagram: boolean;
  readonly supportsConstellation: boolean;
  readonly supportsBERAnalysis: boolean;
  readonly supportsFftView: boolean;
}

export interface DatasetBase {
  readonly id: string;
  readonly family: DatasetFamily;
  readonly kind: DatasetKind;
  readonly label: string;
  readonly fileId?: string | number | null;
  readonly fileName?: string | null;
  readonly hidden?: boolean;
  readonly isUniform?: boolean;
  readonly provenance: Provenance;
  readonly capabilities: DatasetCapabilities;
}

export interface ScalarSample {
  readonly x: number;
  readonly y: number;
}

export interface ScalarSeries {
  readonly id: string;
  readonly label: string;
  readonly xUnit: XUnit | string | null;
  readonly yUnit: YUnit | string | null;
  readonly samples: readonly ScalarSample[];
}

export interface SpectrumDataset extends DatasetBase {
  readonly family: 'spectrum';
  readonly xDomain: 'frequency';
  readonly series: readonly ScalarSeries[];
}

export interface WaveformDataset extends DatasetBase {
  readonly family: 'waveform';
  readonly xDomain: 'time';
  readonly series: readonly ScalarSeries[];
}

export interface NetworkMatrixSample {
  readonly freqHz: number;
  readonly matrix: ComplexMatrix;
}

export interface NetworkDataset extends DatasetBase {
  readonly family: 'network';
  readonly xDomain: 'frequency';
  readonly parameterFamily: NetworkParameterFamily;
  readonly basis: DatasetBasis;
  readonly portCount: number;
  readonly referenceOhms: readonly number[];
  readonly samples: readonly NetworkMatrixSample[];
}

export interface IQDataset extends DatasetBase {
  readonly family: 'iq';
}

export interface SymbolDataset extends DatasetBase {
  readonly family: 'symbol';
}

export type Dataset =
  | SpectrumDataset
  | WaveformDataset
  | NetworkDataset
  | IQDataset
  | SymbolDataset;

export function makeProvenance(rootDatasetId: string): Provenance {
  return {
    rootDatasetIds: [rootDatasetId],
    transformSteps: [],
  };
}

export function appendTransformStep(
  provenance: Provenance,
  step: TransformStep,
): Provenance {
  return {
    rootDatasetIds: provenance.rootDatasetIds,
    transformSteps: [...provenance.transformSteps, step],
  };
}

export function makeDatasetBase(
  id: string,
  family: DatasetFamily,
  kind: DatasetKind,
  label: string,
  options: {
    fileId?: string | number | null;
    fileName?: string | null;
    hidden?: boolean;
    isUniform?: boolean;
    provenance?: Provenance;
    capabilities?: Partial<DatasetCapabilities>;
  } = {},
): DatasetBase {
  const provenance = options.provenance ?? makeProvenance(id);
  const capabilities = options.capabilities
    ? mergeDatasetCapabilities(DEFAULT_DATASET_CAPABILITIES, options.capabilities)
    : resolveDatasetCapabilities(family, kind);

  return {
    id,
    family,
    kind,
    label,
    fileId: options.fileId ?? null,
    fileName: options.fileName ?? null,
    hidden: options.hidden ?? false,
    isUniform: options.isUniform ?? false,
    provenance,
    capabilities,
  };
}

export function makeScalarSeries(
  id: string,
  label: string,
  samples: readonly ScalarSample[],
  xUnit: XUnit | string | null,
  yUnit: YUnit | string | null,
): ScalarSeries {
  return {
    id,
    label,
    xUnit,
    yUnit,
    samples,
  };
}

export function makeSpectrumDataset(
  id: string,
  label: string,
  series: readonly ScalarSeries[],
  options: {
    fileId?: string | number | null;
    fileName?: string | null;
    hidden?: boolean;
    isUniform?: boolean;
    provenance?: Provenance;
    capabilities?: Partial<DatasetCapabilities>;
  } = {},
): SpectrumDataset {
  const base = makeDatasetBase(id, 'spectrum', 'source', label, options);
  return {
    ...base,
    family: 'spectrum',
    xDomain: 'frequency',
    series,
  };
}

export function makeWaveformDataset(
  id: string,
  label: string,
  series: readonly ScalarSeries[],
  options: {
    fileId?: string | number | null;
    fileName?: string | null;
    hidden?: boolean;
    isUniform?: boolean;
    provenance?: Provenance;
    capabilities?: Partial<DatasetCapabilities>;
  } = {},
): WaveformDataset {
  const base = makeDatasetBase(id, 'waveform', 'source', label, options);
  return {
    ...base,
    family: 'waveform',
    xDomain: 'time',
    series,
  };
}

export function makeNetworkDataset(
  id: string,
  label: string,
  parameterFamily: NetworkParameterFamily,
  basis: DatasetBasis,
  portCount: number,
  referenceOhms: readonly number[],
  samples: readonly NetworkMatrixSample[],
  options: {
    fileId?: string | number | null;
    fileName?: string | null;
    hidden?: boolean;
    isUniform?: boolean;
    provenance?: Provenance;
    kind?: DatasetKind;
    capabilities?: Partial<DatasetCapabilities>;
  } = {},
): NetworkDataset {
  const base = makeDatasetBase(id, 'network', options.kind ?? 'source', label, options);
  const capabilities = options.capabilities
    ? mergeDatasetCapabilities(
        resolveDatasetCapabilities('network', options.kind ?? 'source', { portCount }),
        options.capabilities,
      )
    : resolveDatasetCapabilities('network', options.kind ?? 'source', { portCount });
  return {
    ...base,
    capabilities,
    family: 'network',
    xDomain: 'frequency',
    parameterFamily,
    basis,
    portCount,
    referenceOhms,
    samples,
  };
}

export function makeIQDataset(
  id: string,
  label: string,
  options: {
    fileId?: string | number | null;
    fileName?: string | null;
    hidden?: boolean;
    isUniform?: boolean;
    provenance?: Provenance;
    kind?: DatasetKind;
    capabilities?: Partial<DatasetCapabilities>;
  } = {},
): IQDataset {
  const base = makeDatasetBase(id, 'iq', options.kind ?? 'source', label, options);
  return {
    ...base,
    family: 'iq',
  };
}

export function makeSymbolDataset(
  id: string,
  label: string,
  options: {
    fileId?: string | number | null;
    fileName?: string | null;
    hidden?: boolean;
    isUniform?: boolean;
    provenance?: Provenance;
    kind?: DatasetKind;
    capabilities?: Partial<DatasetCapabilities>;
  } = {},
): SymbolDataset {
  const base = makeDatasetBase(id, 'symbol', options.kind ?? 'source', label, options);
  return {
    ...base,
    family: 'symbol',
  };
}
