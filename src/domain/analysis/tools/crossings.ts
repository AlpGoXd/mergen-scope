import type { AnalysisTool } from '../../../types/registry-contract';
import { findThresholdCrossings } from '../threshold';
import { anyTrace } from './shared';

const params = { level: { kind: 'number', title: 'Level', defaultValue: 0 } } as const;
export const crossingsTool: AnalysisTool<typeof params> = {
  kind: 'measure', meta: { id: 'crossings', title: 'Threshold crossings', description: 'Find crossings of a level.' }, params,
  outputs: [{ type: 'table' }, { type: 'shapes' }], appliesTo: anyTrace,
  compute: ({ traces }, p) => { const crossings = findThresholdCrossings(traces[0]?.data ?? [], p.level); return [{ type: 'table', columns: [{ id: 'x', title: 'X' }], rows: crossings.map(r => [r.freq]) }, ...(crossings.length ? [{ type: 'shapes' as const, shapes: crossings.map(r => ({ kind: 'dot' as const, x: r.freq, y: p.level })) }] : [])]; },
};
