import type { AnalysisTool } from '../../../types/registry-contract';
import { buildPeakSpurTable } from '../range-stats';
import { anyTrace } from './shared';

const params = { minSpacingHz: { kind: 'number', title: 'Minimum spacing', defaultValue: 0, min: 0 }, count: { kind: 'number', title: 'Count', defaultValue: 10, min: 1, max: 50 } } as const;
export const peakTableTool: AnalysisTool<typeof params> = {
  kind: 'measure', meta: { id: 'peak-table', title: 'Peak Table', description: 'Rank peaks in a trace.' }, params,
  outputs: [{ type: 'table' }], appliesTo: anyTrace,
  compute: ({ traces }, p) => [{ type: 'table', columns: [{ id: 'rank', title: 'Rank' }, { id: 'x', title: 'X' }, { id: 'y', title: 'Y' }], rows: buildPeakSpurTable(traces[0]?.data ?? [], { limit: p.count, minSpacingHz: p.minSpacingHz }).map(r => [r.rank, r.freq, r.amp]) }],
};
