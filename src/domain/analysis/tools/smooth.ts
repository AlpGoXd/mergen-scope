import type { AnalysisTool } from '../../../types/registry-contract';
import { smoothTraceData } from '../../trace-ops';
import { anyTrace, derived } from './shared';

const params = { method: { kind: 'choice', title: 'Method', defaultValue: 'moving-average', options: ['none', 'moving-average', 'median-filter', 'savitzky-golay'] }, window: { kind: 'number', title: 'Window', defaultValue: 11, min: 1 }, sgOrder: { kind: 'number', title: 'SG order', defaultValue: 2, min: 1 } } as const;
export const smoothTool: AnalysisTool<typeof params> = {
  kind: 'math', meta: { id: 'smooth', title: 'Smooth', description: 'Smooth trace samples.' }, params,
  outputs: [{ type: 'trace' }], appliesTo: anyTrace,
  compute: ({ traces }, p) => { const t = traces[0]; return t ? [{ type: 'trace', trace: derived(t, smoothTraceData(t.data, p.method, p.window, p.sgOrder).data, 'smooth', { ...p }) }] : []; },
};
