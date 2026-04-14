import type { NetworkDataset, NetworkMatrixSample, NetworkParameterFamily, ScalarSeries, SpectrumDataset, WaveformDataset } from '../types/dataset';
import type { ComplexDisplayPoint, DisplayTrace, ScalarDisplayPoint, ScalarDisplayTrace } from '../types/display';
import type { TouchstoneNetwork } from '../types/touchstone';
import type { Trace } from '../types/trace';
import { makeDatasetCapabilities, makeRootProvenance } from './dataset-capabilities';
import { isUniformDataPoints, isUniformSpacing } from './interpolation';
import { computeTwoPortStability, convertSMatrixToYMatrix, convertSMatrixToZMatrix } from './touchstone-math';

function makeDatasetId(prefix: string, suffix: string): string {
  return `${prefix}-${suffix}`;
}

function makeDisplayTraceId(prefix: string, suffix: string): string {
  return `${prefix}-${suffix}`;
}

export function buildSeriesDatasetFromTrace(
  trace: Trace,
  family: 'spectrum' | 'waveform',
  fileId?: string | number | null,
  fileName?: string | null,
): SpectrumDataset | WaveformDataset {
  const datasetId = makeDatasetId(family, trace.id);
  const seriesId = makeDatasetId('series', trace.id);
  const series: ScalarSeries = {
    id: seriesId,
    label: trace.dn || trace.name,
    xUnit: trace.units.x,
    yUnit: trace.units.y,
    samples: trace.data.map((point) => ({ x: point.freq, y: point.amp })),
  };
  const base = {
    id: datasetId,
    family,
    kind: 'source' as const,
    label: trace.file ? `${trace.file} ${trace.dn || trace.name}` : (trace.dn || trace.name),
    fileId,
    fileName,
    isUniform: isUniformDataPoints(trace.data),
    provenance: makeRootProvenance(datasetId),
    capabilities: makeDatasetCapabilities(family),
  };

  if (family === 'spectrum') {
    return {
      ...base,
      family: 'spectrum',
      xDomain: 'frequency',
      series: [series],
    };
  }

  return {
    ...base,
    family: 'waveform',
    xDomain: 'time',
    series: [series],
  };
}

export function buildScalarDisplayTraceFromSeriesDataset(dataset: SpectrumDataset | WaveformDataset, series: ScalarSeries, trace: Trace): ScalarDisplayTrace {
  const semantics = dataset.family === 'waveform' ? 'time-amplitude' : 'magnitude';
  const points: ScalarDisplayPoint[] = series.samples.map((sample) => ({ x: sample.x, y: sample.y }));
  return {
    id: makeDisplayTraceId('display', trace.id),
    kind: 'dataset-projection',
    label: series.label,
    datasetId: dataset.id,
    family: dataset.family,
    isUniform: dataset.isUniform ?? false,
    interpolation: trace.interpolation,
    provenance: {
      parentDatasetId: dataset.id,
      parentDisplayTraceIds: [],
      transformSteps: [],
    },
    source: {
      sourceType: 'series',
      datasetFamily: dataset.family,
      seriesId: series.id,
    },
    supportedViews: ['cartesian'],
    defaultView: 'cartesian',
    compat: {
      legacyTraceName: trace.name,
      legacyDisplayName: trace.dn || trace.name,
    },
    valueType: 'scalar',
    xUnit: series.xUnit ? String(series.xUnit) : null,
    yUnit: series.yUnit ? String(series.yUnit) : null,
    semantics,
    points,
  };
}

export function buildNetworkDatasetFromTouchstone(network: TouchstoneNetwork, fileName: string, fileId?: string | number | null): NetworkDataset {
  const datasetId = makeDatasetId('network', String(fileId ?? fileName));
  const samples: NetworkMatrixSample[] = network.samples.map((sample) => ({
    freqHz: sample.freq,
    matrix: sample.sMatrix,
  }));

  return {
    id: datasetId,
    family: 'network',
    kind: 'source',
    label: fileName,
    fileId,
    fileName,
    isUniform: isUniformSpacing(samples.map((sample) => sample.freqHz)),
    provenance: makeRootProvenance(datasetId),
    capabilities: makeDatasetCapabilities('network', { portCount: network.portCount }),
    xDomain: 'frequency',
    parameterFamily: network.parameterType === 'G' || network.parameterType === 'H' ? 'S' : network.parameterType,
    basis: 'single-ended',
    portCount: network.portCount,
    referenceOhms: network.referenceOhms,
    samples,
  };
}

function complexPointsFromNetwork(dataset: NetworkDataset, row: number, col: number): ComplexDisplayPoint[] {
  return dataset.samples.flatMap((sample) => {
    const value = sample.matrix[row]?.[col];
    if (!value) {
      return [];
    }
    return [{ x: sample.freqHz, re: value.re, im: value.im }];
  });
}

function scalarPointsFromNetwork(
  dataset: NetworkDataset,
  row: number,
  col: number,
  component: 'magnitude-db' | 'magnitude-linear' | 'phase' | 'real' | 'imag' | 'vswr' | 'return-loss',
): ScalarDisplayPoint[] {
  const complexPoints = complexPointsFromNetwork(dataset, row, col);
  return complexPoints.flatMap((point) => {
    const magnitude = Math.hypot(point.re, point.im);
    if (component === 'magnitude-db') {
      return [{ x: point.x, y: magnitude > 0 ? 20 * Math.log10(magnitude) : -300 }];
    }
    if (component === 'magnitude-linear') {
      return [{ x: point.x, y: magnitude }];
    }
    if (component === 'phase') {
      return [{ x: point.x, y: Math.atan2(point.im, point.re) * 180 / Math.PI }];
    }
    if (component === 'real') {
      return [{ x: point.x, y: point.re }];
    }
    if (component === 'imag') {
      return [{ x: point.x, y: point.im }];
    }
    if (component === 'vswr') {
      if (magnitude >= 1) {
        return [];
      }
      return [{ x: point.x, y: (1 + magnitude) / (1 - magnitude) }];
    }
    if (component === 'return-loss') {
      return [{ x: point.x, y: magnitude > 0 ? -20 * Math.log10(magnitude) : 300 }];
    }
    return [{ x: point.x, y: magnitude }];
  });
}

export function buildNetworkProjectionDisplayTrace(
  dataset: NetworkDataset,
  args: {
    row: number;
    col: number;
    component: 'complex' | 'magnitude-db' | 'magnitude-linear' | 'phase' | 'real' | 'imag' | 'vswr' | 'return-loss';
    label: string;
    legacyTraceName?: string;
    legacyDisplayName?: string;
    instanceKey?: string;
  },
): DisplayTrace {
  const { row, col, component, label, legacyTraceName, legacyDisplayName, instanceKey } = args;
  const suffix = instanceKey ? `-${instanceKey}` : '';
  const id = makeDisplayTraceId('network-display', `${dataset.id}-${dataset.parameterFamily}-${row}-${col}-${component}${suffix}`);
  const common = {
    id,
    kind: 'dataset-projection' as const,
    label,
    datasetId: dataset.id,
    family: dataset.family,
    isUniform: dataset.isUniform ?? false,
    provenance: {
      parentDatasetId: dataset.id,
      parentDisplayTraceIds: [],
      transformSteps: [],
    },
    source: {
      sourceType: 'network-parameter' as const,
      parameterFamily: dataset.parameterFamily,
      basis: dataset.basis,
      row,
      col,
      component,
    },
    supportedViews: component === 'complex' ? ['cartesian', 'smith', 'polar'] as const : ['cartesian'] as const,
    defaultView: component === 'complex' ? 'smith' as const : 'cartesian' as const,
    compat: {
      legacyTraceName,
      legacyDisplayName,
    },
  };

  if (component === 'complex') {
    return {
      ...common,
      valueType: 'complex',
      xUnit: 'Hz',
      valueUnit: dataset.parameterFamily === 'Y' ? 'S' : dataset.parameterFamily === 'Z' ? 'Ohm' : null,
      semantics: dataset.parameterFamily === 'Z' ? 'impedance' : dataset.parameterFamily === 'Y' ? 'admittance' : 'network-parameter',
      points: complexPointsFromNetwork(dataset, row, col),
    };
  }

  const semanticsMap: Record<'magnitude-db' | 'magnitude-linear' | 'phase' | 'real' | 'imag' | 'vswr' | 'return-loss', ScalarDisplayTrace['semantics']> = {
    'magnitude-db': 'magnitude',
    'magnitude-linear': 'magnitude',
    phase: 'phase',
    real: 'real',
    imag: 'imag',
    vswr: 'vswr',
    'return-loss': 'return-loss',
  };

  return {
    ...common,
    valueType: 'scalar',
    xUnit: 'Hz',
    yUnit: component === 'phase' ? 'Degrees' : component === 'vswr' ? 'VSWR' : component === 'return-loss' || component === 'magnitude-db' ? 'dB' : dataset.parameterFamily === 'Y' ? 'S' : dataset.parameterFamily === 'Z' ? 'Ohm' : null,
    semantics: semanticsMap[component],
    points: scalarPointsFromNetwork(dataset, row, col, component),
  };
}

export function convertNetworkDataset(dataset: NetworkDataset, parameterFamily: Extract<NetworkParameterFamily, 'Y' | 'Z'>): NetworkDataset | null {
  if (dataset.parameterFamily === parameterFamily) {
    return dataset;
  }
  if (dataset.parameterFamily !== 'S') {
    return null;
  }

  const samples = dataset.samples.flatMap((sample) => {
    const matrix = parameterFamily === 'Y'
      ? convertSMatrixToYMatrix(sample.matrix, dataset.referenceOhms)
      : convertSMatrixToZMatrix(sample.matrix, dataset.referenceOhms);
    if (!matrix) {
      return [];
    }
    return [{ freqHz: sample.freqHz, matrix }];
  });

  return {
    ...dataset,
    id: makeDatasetId('network', `${dataset.id}-${parameterFamily.toLowerCase()}`),
    kind: 'derived',
    label: `${dataset.label} ${parameterFamily}`,
    isUniform: dataset.isUniform ?? false,
    provenance: {
      rootDatasetIds: dataset.provenance.rootDatasetIds,
      transformSteps: [
        ...dataset.provenance.transformSteps,
        {
          id: makeDatasetId('transform', `${dataset.id}-${parameterFamily.toLowerCase()}`),
          kind: 'network-conversion',
          label: `Convert ${dataset.parameterFamily} -> ${parameterFamily}`,
          params: { from: dataset.parameterFamily, to: parameterFamily },
          inputDatasetIds: [dataset.id],
        },
      ],
    },
    capabilities: makeDatasetCapabilities('network', { portCount: dataset.portCount }),
    parameterFamily,
    samples,
  };
}

export function buildNetworkDerivedScalarTrace(
  dataset: NetworkDataset,
  args: {
    row: number;
    col: number;
    metric: 'group-delay' | 'stability-k' | 'stability-mu1' | 'stability-mu2' | 'stability-muprime';
    label: string;
    legacyTraceName?: string;
    legacyDisplayName?: string;
  },
): ScalarDisplayTrace | null {
  const { row, col, metric, label, legacyTraceName, legacyDisplayName } = args;
  let points: ScalarDisplayPoint[] = [];

    if (metric === 'group-delay') {
      const complexPoints = complexPointsFromNetwork(dataset, row, col);
      if (complexPoints.length < 2) {
        return null;
      }
    const phases = complexPoints.map((point) => ({ x: point.x, phase: Math.atan2(point.im, point.re) }));
    const unwrapped: typeof phases = [];
    let offset = 0;
    for (let index = 0; index < phases.length; index += 1) {
      const point = phases[index]!;
      const prev = phases[index - 1];
      if (prev) {
        const delta = point.phase + offset - prev.phase;
        if (delta > Math.PI) offset -= 2 * Math.PI;
        else if (delta < -Math.PI) offset += 2 * Math.PI;
      }
      unwrapped.push({ x: point.x, phase: point.phase + offset });
    }
    points = [];
    for (let index = 1; index < unwrapped.length; index += 1) {
      const left = unwrapped[index - 1]!;
      const right = unwrapped[index]!;
      const dOmega = 2 * Math.PI * (right.x - left.x);
      if (!Number.isFinite(dOmega) || dOmega === 0) {
        continue;
      }
      points.push({ x: right.x, y: -(right.phase - left.phase) / dOmega });
    }
  } else {
    points = dataset.samples.flatMap((sample) => {
      const stability = computeTwoPortStability(sample.matrix);
      if (!stability) {
        return [];
      }
      if (metric === 'stability-k') return [{ x: sample.freqHz, y: stability.kFactor }];
      if (metric === 'stability-mu1') return [{ x: sample.freqHz, y: stability.mu1 }];
      if (metric === 'stability-mu2' || metric === 'stability-muprime') return [{ x: sample.freqHz, y: stability.mu2 }];
      return [];
    });
  }

  return {
    id: makeDisplayTraceId('network-derived', `${dataset.id}-${row}-${col}-${metric}`),
    kind: 'derived-trace',
    label,
    datasetId: dataset.id,
    family: dataset.family,
    isUniform: dataset.isUniform ?? false,
    provenance: {
      parentDatasetId: dataset.id,
      parentDisplayTraceIds: [],
      transformSteps: [metric],
    },
    source: {
      sourceType: 'network-parameter',
      parameterFamily: dataset.parameterFamily,
      basis: dataset.basis,
      row,
      col,
      component: metric,
    },
    supportedViews: ['cartesian'],
    defaultView: 'cartesian',
    compat: {
      legacyTraceName,
      legacyDisplayName,
    },
    valueType: 'scalar',
    xUnit: 'Hz',
    yUnit: metric === 'group-delay' ? 's' : null,
    semantics: metric === 'group-delay' ? 'group-delay' : 'stability',
    points,
  };
}
