import type { AnalysisTool } from '../../../types/registry-contract';
import { computeRipple } from '../ripple';
import { anyTrace } from './shared';

const params = {} as const;
export const rippleTool: AnalysisTool<typeof params> = {
  kind: 'measure', meta: { id: 'ripple', title: 'Ripple', description: 'Measure peak-to-peak variation.' }, params,
  outputs: [{ type: 'numbers' }, { type: 'shapes' }], appliesTo: anyTrace,
  compute: ({ traces }) => { const data = traces[0]?.data ?? []; const r = computeRipple(data); const first = data[0], last = data[data.length - 1]; return r && first && last ? [{ type: 'numbers', values: { ripple: r.ripple, max: r.max.amp, min: r.min.amp, span: r.spanHz } }, { type: 'shapes', shapes: [{ kind: 'band', x1: first.freq, x2: last.freq, y1: r.min.amp, y2: r.max.amp }] }] : []; },
};
