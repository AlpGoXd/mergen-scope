import type {
  Dataset,
  DatasetCapabilities,
  DatasetFamily,
  DatasetKind,
  NetworkDataset,
} from '../types/dataset';

const DEFAULT_CAPABILITIES: DatasetCapabilities = {
  supportsSmithView: false,
  supportsPolarView: false,
  supportsGroupDelay: false,
  supportsStabilityAnalysis: false,
  supportsEyeDiagram: false,
  supportsConstellation: false,
  supportsBERAnalysis: false,
  supportsFftView: false,
};

export const DEFAULT_DATASET_CAPABILITIES = DEFAULT_CAPABILITIES;

export function makeDatasetCapabilities(
  family: DatasetFamily,
  dataset?: Partial<NetworkDataset>,
): DatasetCapabilities {
  return resolveDatasetCapabilities(family, 'source', dataset);
}

export function makeRootProvenance(id: string) {
  return {
    rootDatasetIds: [id],
    transformSteps: [],
  };
}

export function mergeDatasetCapabilities(
  base: DatasetCapabilities,
  overrides: Partial<DatasetCapabilities>,
): DatasetCapabilities {
  return { ...base, ...overrides };
}

export function resolveDatasetCapabilities(
  family: DatasetFamily,
  kind: DatasetKind,
  dataset?: Partial<NetworkDataset>,
): DatasetCapabilities {
  if (kind === 'derived') {
    return mergeDatasetCapabilities(DEFAULT_CAPABILITIES, {
      supportsGroupDelay: family === 'network',
      supportsSmithView: family === 'network',
      supportsPolarView: family === 'network',
    });
  }

  switch (family) {
    case 'network': {
      const portCount = dataset?.portCount ?? 0;
      return {
        supportsSmithView: true,
        supportsPolarView: true,
        supportsGroupDelay: true,
        supportsStabilityAnalysis: portCount >= 2,
        supportsEyeDiagram: false,
        supportsConstellation: false,
        supportsBERAnalysis: false,
        supportsFftView: false,
      };
    }
    case 'waveform':
      return {
        supportsSmithView: false,
        supportsPolarView: false,
        supportsGroupDelay: false,
        supportsStabilityAnalysis: false,
        supportsEyeDiagram: true,
        supportsConstellation: false,
        supportsBERAnalysis: false,
        supportsFftView: true,
      };
    case 'iq':
    case 'symbol':
      return {
        supportsSmithView: false,
        supportsPolarView: false,
        supportsGroupDelay: false,
        supportsStabilityAnalysis: false,
        supportsEyeDiagram: true,
        supportsConstellation: true,
        supportsBERAnalysis: true,
        supportsFftView: true,
      };
    case 'spectrum':
    default:
      return DEFAULT_CAPABILITIES;
  }
}

export function supportsDatasetCapability(
  dataset: Dataset | null | undefined,
  capability: keyof DatasetCapabilities,
): boolean {
  return !!dataset && dataset.capabilities[capability];
}

export function supportsAnyAnalysis(
  dataset: Dataset | null | undefined,
  capabilities: readonly (keyof DatasetCapabilities)[],
): boolean {
  return capabilities.some((capability) => supportsDatasetCapability(dataset, capability));
}

export function isNetworkDataset(dataset: Dataset | null | undefined): dataset is NetworkDataset {
  return !!dataset && dataset.family === 'network';
}
