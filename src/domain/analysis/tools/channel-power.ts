import type { AnalysisTool } from '../../../types/registry-contract';
import { normalizeUnitName } from '../../units';
import { computeChannelPower } from '../channel-power';
import { sliceTraceToRange } from '../range-stats';
import { allowed, denied } from './shared';

const params = { bandwidthHz: { kind: 'number', title: 'Bandwidth', defaultValue: 0, min: 0 } } as const;
export const channelPowerTool: AnalysisTool<typeof params> = {
  kind: 'measure', meta: { id: 'channel-power', title: 'Channel power', description: 'Integrate spectral power density.' }, params, parameterUnits: { bandwidthHz: 'Hz' },
  outputs: [{ type: 'numbers' }], appliesTo: trace => ['dbm/hz', 'dbmperhz', 'dbw/hz', 'dbwperhz'].includes(normalizeUnitName(trace.units.y)) ? allowed : denied('Select a trace with spectral density units (dBm/Hz or dBW/Hz).'),
  compute: ({ traces }, p) => { const t = traces[0]; if (!t) return []; const first = t.data[0]; const last = t.data[t.data.length - 1]; const centre = first && last ? (first.freq + last.freq) / 2 : 0; const range = p.bandwidthHz > 0 ? { left: centre - p.bandwidthHz / 2, right: centre + p.bandwidthHz / 2 } : null; const r = computeChannelPower(sliceTraceToRange(t.data, range), t.units.y ?? ''); return r.powerDbm !== undefined && r.powerDbw !== undefined ? [{ type: 'numbers', values: { powerDbm: r.powerDbm, powerDbw: r.powerDbw } }] : []; },
};
