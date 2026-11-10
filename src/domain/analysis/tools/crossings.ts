import type { AnalysisTool } from '../../../types/registry-contract';
import { findThresholdCrossings } from '../threshold';
import { anyTrace } from './shared';

const params = { level: { kind: 'number', title: 'Level', defaultValue: 0 } } as const;
export const crossingsTool: AnalysisTool<typeof params> = {
  kind: 'measure', meta: { id: 'crossings', title: 'Threshold crossings', description: 'Find crossings of a level.' }, params,
  outputs: [{ type: 'table' }], appliesTo: anyTrace,
  compute: ({ traces }, p) => [{ type: 'table', columns: [{ id: 'x', title: 'X' }], rows: findThresholdCrossings(traces[0]?.data ?? [], p.level).map(r => [r.freq]) }],
};
