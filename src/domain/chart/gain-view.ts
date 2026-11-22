import type { ChartAxesSettings } from '../../types/pane';
import type { Trace } from '../../types/trace';
import { isDecibelGain, isLinearGain } from '../units';

const identity = (value: number) => value;
const toDb = (value: number) => value > 0 ? 10 * Math.log10(value) : NaN;
const toRatio = (value: number) => 10 ** (value / 10);

/** A pane can share a gain view when its traces use the same source reference. */
export function chartGainView(traces: Trace[], preference: ChartAxesSettings['gain']) {
  const first = traces[0];
  const native = first && isDecibelGain(first.units.x, first.units.y) ? 'db'
    : first && isLinearGain(first.units.x, first.units.y) ? 'linear' : null;
  const compatible = native === 'db'
    ? traces.every(trace => isDecibelGain(trace.units.x, trace.units.y)
      && trace.units.y?.trim().toLowerCase() === first?.units.y?.trim().toLowerCase())
    : native === 'linear' && traces.every(trace => isLinearGain(trace.units.x, trace.units.y));
  const mode = compatible ? preference ?? native : null;
  if (mode === null || mode === native) {
    return { mode, traces, toDisplay: identity, toSource: identity };
  }
  const toDisplay = mode === 'db' ? toDb : toRatio;
  const toSource = mode === 'db' ? toRatio : toDb;
  const unit = mode === 'db' ? 'dB' : 'ratio';
  return {
    mode, toDisplay, toSource,
    traces: traces.map(trace => ({
      ...trace, units: { ...trace.units, y: unit },
      data: trace.data.map(point => ({ ...point, amp: toDisplay(point.amp) })),
    })),
  };
}
