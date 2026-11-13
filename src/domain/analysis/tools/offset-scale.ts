import type { AnalysisTool } from '../../../types/registry-contract';
import { anyTrace, derived } from './shared';

const params = { offset: { kind: 'number', title: 'Offset', defaultValue: 0 }, scale: { kind: 'number', title: 'Scale', defaultValue: 1 } } as const;
export const offsetScaleTool: AnalysisTool<typeof params> = {
  kind: 'math', meta: { id: 'offset-scale', title: 'Offset / Scale', description: 'Apply an offset and scale.' }, params,
  outputs: [{ type: 'trace' }], appliesTo: anyTrace,
  compute: ({ traces }, p) => { const t = traces[0]; return t ? [{ type: 'trace', trace: derived(t, t.data.map(point => ({ freq: point.freq, amp: point.amp * p.scale + p.offset })), p.scale === 1 ? 'offset' : 'scale', { ...p }) }] : []; },
};
