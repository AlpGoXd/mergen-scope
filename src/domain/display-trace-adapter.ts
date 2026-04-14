import type { Dataset, NetworkDataset, ScalarSeries } from '../types/dataset';
import type {
  ComplexDisplayTrace,
  DisplayTrace,
  DisplayTraceSourceRef,
  ScalarDisplayTrace,
} from '../types/display';
import type { RawFileRecord } from '../types/file';
import type { TouchstoneNetwork, TouchstoneParameterType, NetworkSource } from '../types/touchstone';
import type { RawTrace, Trace } from '../types/trace';
import { makeTraceId, makeTouchstoneTraceLabel, makeTouchstoneTraceName } from './trace-model';

function findDataset(datasets: readonly Dataset[], datasetId: string): Dataset | null {
  return datasets.find((dataset) => dataset.id === datasetId) ?? null;
}

function findSeries(dataset: Dataset, seriesId: string): ScalarSeries | null {
  if (dataset.family !== 'spectrum' && dataset.family !== 'waveform') {
    return null;
  }
  return dataset.series.find((series) => series.id === seriesId) ?? null;
}

function makeLegacyData(points: readonly { x: number; y: number }[]) {
  return points.map((point) => ({ freq: point.x, amp: point.y }));
}

function makeLegacyMagnitudeData(points: readonly { x: number; re: number; im: number }[]) {
  return points.map((point) => ({ freq: point.x, amp: Math.hypot(point.re, point.im) }));
}

function getLegacyTraceName(displayTrace: DisplayTrace): string {
  return displayTrace.compat?.legacyTraceName ?? displayTrace.id;
}

function getLegacyDisplayName(displayTrace: DisplayTrace): string {
  return displayTrace.compat?.legacyDisplayName ?? displayTrace.label;
}

function mapParameterType(parameterFamily: string): TouchstoneParameterType {
  if (parameterFamily === 'Y' || parameterFamily === 'Z' || parameterFamily === 'G' || parameterFamily === 'H') {
    return parameterFamily;
  }
  return 'S';
}

function makeTouchstoneNetwork(dataset: NetworkDataset): TouchstoneNetwork {
  return {
    parameterType: mapParameterType(dataset.parameterFamily),
    portCount: dataset.portCount,
    referenceOhms: dataset.referenceOhms,
    freqUnit: 'Hz',
    dataFormat: 'RI',
    comments: [],
    samples: dataset.samples.map((sample) => ({
      freq: sample.freqHz,
      sMatrix: sample.matrix,
    })),
    matrixFormat: 'full',
    version: 1,
  };
}

function makeNetworkSource(
  dataset: NetworkDataset,
  displayTrace: ComplexDisplayTrace | ScalarDisplayTrace,
  file: RawFileRecord | null,
  source: DisplayTraceSourceRef | null,
): NetworkSource {
  const row = source?.sourceType === 'network-parameter' ? source.row : 0;
  const col = source?.sourceType === 'network-parameter' ? source.col : 0;
  const family = source?.sourceType === 'network-parameter' ? source.parameterFamily : dataset.parameterFamily;

  return {
    parentFileId: file?.id ?? dataset.fileId ?? null,
    family,
    view:
      source?.sourceType === 'network-parameter'
        ? source.component
        : displayTrace.semantics,
    row,
    col,
    metric:
      displayTrace.valueType === 'scalar'
        ? (displayTrace.semantics === 'stability' || displayTrace.semantics === 'group-delay'
            ? displayTrace.semantics
            : undefined)
        : undefined,
    portCount: dataset.portCount,
    referenceOhms: dataset.referenceOhms,
    parameterType: dataset.parameterFamily,
    fileName: file?.fileName ?? dataset.fileName ?? undefined,
    freqUnit: 'Hz',
    dataFormat: 'RI',
  };
}

function adaptSeriesTrace(
  displayTrace: ScalarDisplayTrace,
  dataset: Dataset,
  file: RawFileRecord | null,
): RawTrace {
  const seriesId = displayTrace.source?.sourceType === 'series' ? displayTrace.source.seriesId : '';
  const series = findSeries(dataset, seriesId);
  const xUnit = displayTrace.xUnit ?? series?.xUnit ?? null;
  const yUnit = displayTrace.yUnit ?? series?.yUnit ?? null;
  const points = displayTrace.points;

  return {
    id: displayTrace.id || makeTraceId(),
    kind: 'raw',
    sourceTraceIds: displayTrace.provenance.parentDisplayTraceIds.length
      ? [...displayTrace.provenance.parentDisplayTraceIds]
      : [displayTrace.id],
    operationType: null,
    parameters: {
      datasetId: dataset.id,
      displayTraceId: displayTrace.id,
      semantics: displayTrace.semantics,
    },
    units: { x: xUnit, y: yUnit },
    paneId: null,
    name: getLegacyTraceName(displayTrace),
    mode: '',
    detector: '',
    family: dataset.family,
    domain: dataset.family === 'waveform' ? 'time' : 'frequency',
    data: makeLegacyData(points),
    file: file?.fileName ?? dataset.fileName ?? null,
    dn: getLegacyDisplayName(displayTrace),
    isUniform: displayTrace.isUniform ?? dataset.isUniform ?? false,
    interpolation: displayTrace.interpolation,
    fileId: file?.id ?? dataset.fileId ?? null,
    fileName: file?.fileName ?? dataset.fileName ?? null,
  };
}

function adaptComplexNetworkTrace(
  displayTrace: ComplexDisplayTrace,
  dataset: NetworkDataset,
  file: RawFileRecord | null,
): RawTrace {
  const source = displayTrace.source?.sourceType === 'network-parameter' ? displayTrace.source : null;
  const row = source?.row ?? 0;
  const col = source?.col ?? 0;
  const family = source?.parameterFamily ?? dataset.parameterFamily;
  const name =
    getLegacyTraceName(displayTrace) ||
    makeTouchstoneTraceName(file?.fileName ?? dataset.fileName ?? dataset.label, family, row + 1, col + 1, 'complex');
  const label =
    getLegacyDisplayName(displayTrace) ||
    makeTouchstoneTraceLabel(file?.fileName ?? dataset.fileName ?? dataset.label, family, row + 1, col + 1, 'complex');

  return {
    id: displayTrace.id || makeTraceId(),
    kind: 'raw',
    sourceTraceIds: [displayTrace.id],
    operationType: null,
    parameters: {
      datasetId: dataset.id,
      displayTraceId: displayTrace.id,
      semantics: displayTrace.semantics,
    },
    units: { x: displayTrace.xUnit ?? null, y: displayTrace.valueUnit ?? null },
    paneId: null,
    name,
    mode: '',
    detector: '',
    family: dataset.family,
    domain: 'frequency',
    data: makeLegacyMagnitudeData(displayTrace.points),
    file: file?.fileName ?? dataset.fileName ?? null,
    dn: label,
    isUniform: displayTrace.isUniform ?? dataset.isUniform ?? false,
    interpolation: displayTrace.interpolation,
    fileId: file?.id ?? dataset.fileId ?? null,
    fileName: file?.fileName ?? dataset.fileName ?? null,
    touchstoneNetwork: makeTouchstoneNetwork(dataset),
    networkSource: makeNetworkSource(dataset, displayTrace, file, source),
  };
}

function adaptScalarNetworkTrace(
  displayTrace: ScalarDisplayTrace,
  dataset: NetworkDataset,
  file: RawFileRecord | null,
): RawTrace {
  const source = displayTrace.source?.sourceType === 'network-parameter' ? displayTrace.source : null;
  const row = source?.row ?? 0;
  const col = source?.col ?? 0;
  const family = source?.parameterFamily ?? dataset.parameterFamily;
  const view = source?.component ?? displayTrace.semantics;
  const name =
    getLegacyTraceName(displayTrace) ||
    makeTouchstoneTraceName(file?.fileName ?? dataset.fileName ?? dataset.label, family, row + 1, col + 1, String(view));
  const label =
    getLegacyDisplayName(displayTrace) ||
    makeTouchstoneTraceLabel(file?.fileName ?? dataset.fileName ?? dataset.label, family, row + 1, col + 1, String(view));

  return {
    id: displayTrace.id || makeTraceId(),
    kind: 'raw',
    sourceTraceIds: displayTrace.provenance.parentDisplayTraceIds.length
      ? [...displayTrace.provenance.parentDisplayTraceIds]
      : [displayTrace.id],
    operationType: null,
    parameters: {
      datasetId: dataset.id,
      displayTraceId: displayTrace.id,
      semantics: displayTrace.semantics,
    },
    units: { x: displayTrace.xUnit, y: displayTrace.yUnit },
    paneId: null,
    name,
    mode: '',
    detector: '',
    family: dataset.family,
    domain: 'frequency',
    data: makeLegacyData(displayTrace.points),
    file: file?.fileName ?? dataset.fileName ?? null,
    dn: label,
    isUniform: displayTrace.isUniform ?? dataset.isUniform ?? false,
    interpolation: displayTrace.interpolation,
    fileId: file?.id ?? dataset.fileId ?? null,
    fileName: file?.fileName ?? dataset.fileName ?? null,
    touchstoneNetwork: makeTouchstoneNetwork(dataset),
    networkSource: makeNetworkSource(dataset, displayTrace, file, source),
  };
}

export function adaptDisplayTraceToLegacyTrace(
  datasets: readonly Dataset[],
  displayTrace: DisplayTrace,
  file: RawFileRecord | null,
): Trace | null {
  const dataset = findDataset(datasets, displayTrace.datasetId);
  if (!dataset) {
    return null;
  }

  if (displayTrace.valueType === 'complex' && dataset.family === 'network') {
    return adaptComplexNetworkTrace(displayTrace, dataset, file);
  }

  if (displayTrace.valueType === 'scalar' && dataset.family === 'network') {
    return adaptScalarNetworkTrace(displayTrace, dataset, file);
  }

  if (displayTrace.valueType === 'scalar') {
    return adaptSeriesTrace(displayTrace, dataset, file);
  }

  return null;
}

export function adaptDisplayTracesToLegacyTraces(
  datasets: readonly Dataset[],
  displayTraces: readonly DisplayTrace[],
  file: RawFileRecord | null,
): Trace[] {
  return displayTraces
    .map((displayTrace) => adaptDisplayTraceToLegacyTrace(datasets, displayTrace, file))
    .filter((trace): trace is Trace => trace !== null);
}
