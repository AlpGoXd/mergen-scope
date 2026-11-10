import type { AnalysisTool } from '../../../types/registry-contract';
import { computeStabilityFactors } from '../touchstone';
import { allowed, denied } from './shared';

const params = {} as const;
export const stabilityTool: AnalysisTool<typeof params> = {
  kind: 'measure', meta: { id: 'stability', title: 'Stability', description: 'Calculate two-port stability factors.' }, params,
  outputs: [{ type: 'numbers' }], appliesTo: trace => trace.kind === 'raw' && trace.touchstoneNetwork?.portCount === 2 ? allowed : denied('Requires a 2-port Touchstone network.'),
  appliesToInputs: inputs => inputs.touchstone?.network?.portCount === 2 ? allowed : denied('Requires a 2-port Touchstone network.'),
  compute: inputs => { const r = computeStabilityFactors(inputs.touchstone ?? null); return r ? [{ type: 'numbers', values: { minK: r.minK.value, minMu1: r.minMu1.value, minMu2: r.minMu2.value, minDelta: r.minDelta.value, maxDelta: r.maxDelta.value, unstableCount: r.unstableCount, count: r.count } }] : []; },
};
