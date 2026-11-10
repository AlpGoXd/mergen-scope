import type { AnalysisTool } from '../../../types/registry-contract';
import { computeLineIntersections } from '../../ref-lines';
import { allowed, anyTrace, denied } from './shared';

const params = {} as const;
export const lineCrossingsTool: AnalysisTool<typeof params> = {
  kind: 'measure', addable: false, meta: { id: 'line-crossings', title: 'Line crossings', description: 'Find intersections with a reference line.' }, params,
  outputs: [{ type: 'table' }], appliesTo: anyTrace,
  appliesToInputs: inputs => inputs.lines?.some(line => line.id === inputs.lineId) ? allowed : denied('Reference line not found.'),
  compute: inputs => {
    const line = inputs.lines?.find(item => item.id === inputs.lineId);
    if (!line) return [];
    const rows = computeLineIntersections(line, inputs.lines ?? [], inputs.traces, inputs.tracePaneMap ?? {}, inputs.vis ?? {});
    return [{ type: 'table', columns: [{ id: 'paneId', title: 'Pane' }, { id: 'traceName', title: 'Trace' }, { id: 'value', title: 'Value' }], rows: rows.map(r => [r.paneId, r.traceName, line.type === 'v' ? r.amp : r.freq]) }];
  },
};
