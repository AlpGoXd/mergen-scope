import type { AnalysisTool } from '../../../types/registry-contract';
import { calcIP3FromPoints, getIP3PointsFromMarkers } from '../ip3';
import { allowed, anyTrace, denied } from './shared';

const params = { gain: { kind: 'number', title: 'Gain', defaultValue: 0 } } as const;
export const ip3Tool: AnalysisTool<typeof params> = {
  kind: 'measure', cardGuidesInputs: true, meta: { id: 'ip3', title: 'IP3', description: 'Calculate third-order intercept from role markers.' }, params, parameterUnits: { gain: 'dB' },
  outputs: [{ type: 'numbers' }], appliesTo: anyTrace,
  appliesToInputs: inputs => calcIP3FromPoints(getIP3PointsFromMarkers([...(inputs.markers ?? [])])) ? allowed : denied('Place F1, F2, IM3L and IM3U markers'),
  compute: (inputs, p) => { const r = calcIP3FromPoints(getIP3PointsFromMarkers([...(inputs.markers ?? [])])); return r ? [{ type: 'numbers', values: { ...r, iip3: r.oip3_avg - p.gain } }] : []; },
};
