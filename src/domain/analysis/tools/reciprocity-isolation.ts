import type { AnalysisTool } from '../../../types/registry-contract';
import { computeReciprocityIsolation } from '../touchstone';
import { allowed, denied } from './shared';

const params = {} as const;
export const reciprocityIsolationTool: AnalysisTool<typeof params> = {
  kind: 'measure', meta: { id: 'reciprocity-isolation', title: 'Reciprocity / Isolation', description: 'Measure two-port reciprocity and isolation.' }, params,
  outputs: [{ type: 'numbers' }], appliesTo: () => allowed, // the 2-port check is on the target's network context (appliesToInputs)
  appliesToInputs: inputs => (inputs.touchstone?.portCount ?? inputs.touchstone?.network?.portCount) === 2 ? allowed : denied('Requires a 2-port Touchstone network.'),
  compute: inputs => { const r = computeReciprocityIsolation(inputs.touchstone ?? null); return r ? [{ type: 'numbers', values: { reciprocityError: r.reciprocityError.value, worstIsolationDb: r.worstIsolationDb.value, averageReciprocityErrorDb: r.averageReciprocityErrorDb, count: r.count } }] : []; },
};
