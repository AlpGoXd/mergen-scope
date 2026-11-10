import type { AnalysisTool } from '../../../types/registry-contract';
import { computeBandwidth } from '../bandwidth';
import { computeRangeStats } from '../range-stats';
import { anyTrace } from './shared';

const params = { drop: { kind: 'number', title: 'Drop', defaultValue: 3, min: 0 } } as const;
export const bandwidthTool: AnalysisTool<typeof params> = {
  kind: 'measure', meta: { id: 'bandwidth', title: 'Bandwidth', description: 'Measure bandwidth at a drop from the peak.' }, params, parameterUnits: { drop: 'dB' },
  outputs: [{ type: 'numbers' }, { type: 'overlay' }], appliesTo: anyTrace,
  compute: ({ traces }, p) => {
    const data = traces[0]?.data ?? [];
    const peak = computeRangeStats(data)?.max;
    const r = peak && computeBandwidth(data, peak.freq, peak.amp, p.drop);
    return r ? [{ type: 'numbers', values: { bandwidth: r.bandwidth, centre: (r.left + r.right) / 2, left: r.left, right: r.right, refAmp: r.refAmp, refX: r.refFreq } }, { type: 'overlay', points: [{ x: r.left, y: r.level }, { x: r.right, y: r.level }] }] : [];
  },
};
