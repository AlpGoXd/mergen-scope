import type { AnalysisTool } from '../../../types/registry-contract';
import { normalizeUnitName } from '../../units';
import { computeOccupiedBandwidth } from '../channel-power';
import { allowed, denied } from './shared';

const params = { percent: { kind: 'number', title: 'Percent', defaultValue: 99, min: 0, max: 100 } } as const;
export const occupiedBandwidthTool: AnalysisTool<typeof params> = {
  kind: 'measure', meta: { id: 'occupied-bandwidth', title: 'Occupied bandwidth', description: 'Measure power containment bandwidth.' }, params, parameterUnits: { percent: '%' },
  outputs: [{ type: 'numbers' }], appliesTo: trace => ['dbm', 'dbw'].includes(normalizeUnitName(trace.units.y)) ? allowed : denied('Select a trace with power units (dBm or dBW).'),
  compute: ({ traces }, p) => { const t = traces[0]; if (!t) return []; const r = computeOccupiedBandwidth(t.data, p.percent, t.units.y ?? ''); return r.bandwidth !== undefined && r.lower !== undefined && r.upper !== undefined && r.percent !== undefined ? [{ type: 'numbers', values: { bandwidth: r.bandwidth, lower: r.lower, upper: r.upper, percent: r.percent } }] : []; },
};
