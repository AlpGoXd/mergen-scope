import type { RawFileRecord } from '../types/file';
import type { Dataset, NetworkDataset } from '../types/dataset';
import type { DisplayTrace } from '../types/display';
import type { RawTrace } from '../types/trace';
import { buildNetworkDatasetFromTouchstone, buildNetworkDerivedScalarTrace, buildNetworkProjectionDisplayTrace, buildScalarDisplayTraceFromSeriesDataset, buildSeriesDatasetFromTrace, convertNetworkDataset } from './dataset-builders';
import { adaptDisplayTracesToLegacyTraces } from './display-trace-adapter';

function legacyViewToComponent(view: string | undefined): 'magnitude-db' | 'magnitude-linear' | 'phase' | 'real' | 'imag' {
  const normalized = String(view ?? '').trim().toLowerCase();
  if (normalized === 'phase') return 'phase';
  if (normalized === 'real') return 'real';
  if (normalized === 'imag') return 'imag';
  if (normalized === 'mag') return 'magnitude-linear';
  return 'magnitude-db';
}

function normalizeLegacyMatrixIndex(value: number | undefined, portCount: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  if (value >= 1 && value <= portCount) {
    return value - 1;
  }
  return Math.max(0, Math.min(portCount - 1, value));
}

function migrateTouchstoneDisplays(file: RawFileRecord, sourceDataset: NetworkDataset): { datasets: Dataset[]; displayTraces: DisplayTrace[] } {
  const datasets: Dataset[] = [sourceDataset];
  const displayTraces: DisplayTrace[] = [];

  file.traces.forEach((trace) => {
    const raw = trace as RawTrace;
    const source = raw.networkSource;
    if (!source) {
      return;
    }
    const family = (source.family ?? sourceDataset.parameterFamily) as 'S' | 'Y' | 'Z';
    let dataset: NetworkDataset = sourceDataset;
    if (family !== 'S') {
      const converted = convertNetworkDataset(sourceDataset, family);
      if (!converted) {
        return;
      }
      dataset = converted;
      if (!datasets.some((item) => item.id === converted.id)) {
        datasets.push(converted);
      }
    }

    const row = normalizeLegacyMatrixIndex(source.row, dataset.portCount);
    const col = normalizeLegacyMatrixIndex(source.col, dataset.portCount);
    const metric = String(source.metric ?? '').trim().toLowerCase();
    if (metric === 'group-delay' || metric === 'k' || metric === 'mu1' || metric === 'mu2') {
      const derived = buildNetworkDerivedScalarTrace(dataset, {
        row,
        col,
        metric: metric === 'group-delay' ? 'group-delay' : metric === 'k' ? 'stability-k' : metric === 'mu1' ? 'stability-mu1' : 'stability-mu2',
        label: trace.dn || trace.name,
        legacyTraceName: trace.name,
        legacyDisplayName: trace.dn || trace.name,
      });
      if (derived) {
        displayTraces.push(derived);
      }
      return;
    }

    displayTraces.push(buildNetworkProjectionDisplayTrace(dataset, {
      row,
      col,
      component: legacyViewToComponent(source.view),
      label: trace.dn || trace.name,
      legacyTraceName: trace.name,
      legacyDisplayName: trace.dn || trace.name,
    }));
  });

  return { datasets, displayTraces };
}

function migrateScalarDisplays(file: RawFileRecord): { datasets: Dataset[]; displayTraces: DisplayTrace[] } {
  const datasets: Dataset[] = [];
  const displayTraces: DisplayTrace[] = [];

  file.traces.forEach((trace) => {
    const family = trace.domain === 'time' ? 'waveform' : 'spectrum';
    const dataset = buildSeriesDatasetFromTrace(trace, family, file.id, file.fileName);
    const displayTrace = buildScalarDisplayTraceFromSeriesDataset(dataset, dataset.series[0]!, trace);
    datasets.push(dataset);
    displayTraces.push(displayTrace);
  });

  return { datasets, displayTraces };
}

export function migrateFileRecordToV4(file: RawFileRecord): RawFileRecord {
  if (file.datasets && file.displayTraces) {
    return file;
  }

  if (file.touchstoneNetwork) {
    const sourceDataset = buildNetworkDatasetFromTouchstone(file.touchstoneNetwork, file.fileName, file.id);
    const migrated = migrateTouchstoneDisplays(file, sourceDataset);
    return {
      ...file,
      datasets: migrated.datasets,
      displayTraces: migrated.displayTraces,
      traces: adaptDisplayTracesToLegacyTraces(migrated.datasets, migrated.displayTraces, file),
    };
  }

  const migrated = migrateScalarDisplays(file);
  return {
    ...file,
    datasets: migrated.datasets,
    displayTraces: migrated.displayTraces,
    traces: adaptDisplayTracesToLegacyTraces(migrated.datasets, migrated.displayTraces, file),
  };
}

export function migrateFilesToV4(files: readonly RawFileRecord[]): RawFileRecord[] {
  return files.map((file) => migrateFileRecordToV4(file));
}
