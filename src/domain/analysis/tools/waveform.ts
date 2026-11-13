import type { AnalysisTool, OverlayShape } from '../../../types/registry-contract';
import { measureWaveform } from '../waveform';
import { sliceTraceToRange } from '../range-stats';
import { sourceVisibleRange, timeTraceOnly } from './shared';

const params = { range: { kind: 'choice', title: 'Range', defaultValue: 'visible', options: ['visible', 'all'] } } as const;
const value = (v: number | null): number => v ?? NaN;

export const waveformTool: AnalysisTool<typeof params> = {
  kind: 'measure', meta: { id: 'waveform', title: 'Waveform', description: 'Frequency, levels, edges and duty cycle.' }, params,
  outputs: [{ type: 'numbers' }, { type: 'shapes' }], appliesTo: timeTraceOnly,
  compute: (inputs, p) => {
    const trace = inputs.traces[0];
    if (!trace) return [];
    const r = measureWaveform(sliceTraceToRange(trace.data, p.range === 'visible' ? sourceVisibleRange(inputs, trace) : null));
    if (!r) return [];
    const shapes: OverlayShape[] = [];
    // Outlines only: the 10 % and 90 % levels around one rising edge, and one measured period.
    const edge = r.risingEdge;
    if (edge) {
      const pad = Math.max(edge.t90 - edge.t10, (r.period ?? 0) / 4);
      shapes.push({ kind: 'level', x1: edge.t10 - pad, x2: edge.t90 + pad, y: r.low }, { kind: 'level', x1: edge.t10 - pad, x2: edge.t90 + pad, y: r.high });
    }
    if (r.periodSpan) shapes.push({ kind: 'band', x1: r.periodSpan.start, x2: r.periodSpan.end });
    return [
      { type: 'numbers', values: {
        frequency: value(r.frequency), period: value(r.period), vpp: r.vpp, max: r.max, min: r.min, mean: r.mean, rms: r.rms,
        riseTime: value(r.riseTime), fallTime: value(r.fallTime), overshoot: value(r.overshoot), dutyCycle: value(r.dutyCycle), count: r.count,
      } },
      ...(shapes.length ? [{ type: 'shapes' as const, shapes }] : []),
    ];
  },
};
