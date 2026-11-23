import type { FileState } from '../../stores/file-store';
import type { TraceState, TraceContextValue } from '../../stores/trace-store';
import { adaptDisplayTracesToLegacyTraces } from '../display-trace-adapter';

export function traceView(files: FileState, traces: TraceState): TraceContextValue {
  const rawKnown = files.files.flatMap(file => file.datasets?.length && file.displayTraces
    ? adaptDisplayTracesToLegacyTraces(file.datasets, file.displayTraces, file)
    : file.traces);
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
