import type { FileState } from '../../stores/file-store';
import type { TraceState, TraceContextValue } from '../../stores/trace-store';
import type { RawFileRecord } from '../../types/file';
import type { Trace } from '../../types/trace';
import { adaptDisplayTracesToLegacyTraces } from '../display-trace-adapter';

interface CachedFileTraces {
  readonly id: RawFileRecord['id'];
  readonly fileName: string;
  readonly wizardConfig: RawFileRecord['wizardConfig'];
  readonly datasets: RawFileRecord['datasets'];
  readonly displayTraces: RawFileRecord['displayTraces'];
  readonly traces: readonly Trace[];
}

const fileTracesCache = new WeakMap<RawFileRecord, CachedFileTraces>();

function knownTracesForFile(file: RawFileRecord): readonly Trace[] {
  if (!file.datasets?.length || !file.displayTraces) return file.traces;
  const cached = fileTracesCache.get(file);
  if (cached
    && cached.id === file.id
    && cached.fileName === file.fileName
    && cached.wizardConfig === file.wizardConfig
    && cached.datasets === file.datasets
    && cached.displayTraces === file.displayTraces) {
    return cached.traces;
  }
  const traces = adaptDisplayTracesToLegacyTraces(file.datasets, file.displayTraces, file);
  fileTracesCache.set(file, {
    id: file.id,
    fileName: file.fileName,
    wizardConfig: file.wizardConfig,
    datasets: file.datasets,
    displayTraces: file.displayTraces,
    traces,
  });
  return traces;
}

export function traceView(files: FileState, traces: TraceState): TraceContextValue {
  const rawKnown = files.files.flatMap(knownTracesForFile);
  const hidden = new Set(files.files.flatMap(file => (file.displayTraces ?? [])
    .filter(display => display.hidden)
    .map(display => display.id)));
  return {
    ...traces,
    allKnownTraces: [...rawKnown, ...traces.derivedTraces],
    allTraces: [...rawKnown.filter(trace => !hidden.has(trace.id)), ...traces.derivedTraces],
    allDatasets: files.files.flatMap(file => file.datasets ?? []),
    allDisplayTraces: files.files.flatMap(file => file.displayTraces ?? []),
  };
}
