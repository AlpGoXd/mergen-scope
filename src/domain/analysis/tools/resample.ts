import type { AnalysisTool } from '../../../types/registry-contract';
import { resampleEven } from '../resample';
import { derived, timeTraceOnly } from './shared';

const params = { method: { kind: 'choice', title: 'Method', defaultValue: 'linear', options: ['linear', 'cubic'] } } as const;

export const resampleTool: AnalysisTool<typeof params> = {
  kind: 'math', meta: { id: 'resample', title: 'Resample', description: 'Evenly spaced copy of a time trace with uneven timestamps (for FFT).' }, params,
  outputs: [{ type: 'trace' }], appliesTo: timeTraceOnly,
  compute: ({ traces }, p) => {
    const trace = traces[0];
    return trace ? [{ type: 'trace', trace: { ...derived(trace, resampleEven(trace.data, p.method), 'derived', { ...p, transform: 'resample' }), isUniform: true } }] : [];
  },
};
