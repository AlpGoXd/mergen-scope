import type { AnalysisTool } from '../../../types/registry-contract';
import { computeRangeStats, sliceTraceToRange } from '../range-stats';
import { anyTrace } from './shared';

const params = { range: { kind: 'choice', title: 'Range', defaultValue: 'visible', options: ['visible', 'all'] } } as const;
export const rangeStatsTool: AnalysisTool<typeof params> = {
  kind: 'measure', meta: { id: 'range-stats', title: 'Range Statistics', description: 'Summarize trace samples.' }, params,
  outputs: [{ type: 'numbers' }], appliesTo: anyTrace,
  compute: (inputs, p) => {
    const view = inputs.visibleRange;
    const range = p.range === 'visible' && view && Number.isFinite(view.left) && Number.isFinite(view.right) && view.left < view.right ? view : null;
    const result = computeRangeStats(sliceTraceToRange(inputs.traces[0]?.data ?? [], range));
    return result ? [{ type: 'numbers', values: { max: result.max.amp, maxX: result.max.freq, min: result.min.amp, minX: result.min.freq, average: result.average, span: result.spanHz, count: result.count } }] : [];
  },
};
