import type { AnalysisTool } from '../../../types/registry-contract';
import { computeRipple } from '../ripple';
import { anyTrace } from './shared';

const params = {} as const;
export const rippleTool: AnalysisTool<typeof params> = {
  kind: 'measure', meta: { id: 'ripple', title: 'Ripple', description: 'Measure peak-to-peak variation.' }, params,
  outputs: [{ type: 'numbers' }], appliesTo: anyTrace,
  compute: ({ traces }) => { const r = computeRipple(traces[0]?.data ?? []); return r ? [{ type: 'numbers', values: { ripple: r.ripple, max: r.max.amp, min: r.min.amp, span: r.spanHz } }] : []; },
};
