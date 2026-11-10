import { describe, expect, it } from 'vitest';
import { computeInstance, createInstance } from '../../src/domain/analysis/instances';
import { describeInstance } from '../../src/domain/analysis/card-view';
import type { AnalysisInputs, ParameterValue } from '../../src/types/registry-contract';
import type { TouchstoneContext } from '../../src/types/analysis';
import type { TouchstoneNetwork } from '../../src/types/touchstone';
import { makeTestTrace } from './helpers';

const trace = makeTestTrace({ id: 'source', name: 'source', data: [{ freq: 0, amp: 1 }, { freq: 1, amp: 3 }, { freq: 2, amp: 2 }] });
const peak = makeTestTrace({ id: 'peak', data: [{ freq: 0, amp: 0 }, { freq: 1, amp: 6 }, { freq: 2, amp: 0 }], interpolation: 'linear' });
const markers = ['F1', 'F2', 'IM3L', 'IM3U'].map((label, index) => ({ id: String(index), freq: index + 1, amp: index < 2 ? 0 : -20, trace: peak.name, type: 'normal' as const, label, refId: null, interpolated: false }));
const line = { id: 1, type: 'v' as const, paneIds: ['p1'], value: 0.5, label: null };
const network: TouchstoneNetwork = { parameterType: 'S', portCount: 2, referenceOhms: [50, 50], freqUnit: 'Hz', dataFormat: 'RI', comments: [], matrixFormat: 'full', version: 1, samples: [{ freq: 1, sMatrix: [[{ re: 0.2, im: 0 }, { re: 0.1, im: 0 }], [{ re: 0.5, im: 0 }, { re: 0.3, im: 0 }]] }] };
const touchstone = { network } as TouchstoneContext;

function card(toolId: string, inputs: AnalysisInputs, params: Record<string, ParameterValue> = {}) {
  const instance = createInstance('a', toolId, { traceId: inputs.traces[0]?.id ?? null, lineId: 1 }, params);
  if (!instance) throw new Error('missing instance');
  const result = computeInstance(instance, inputs);
  expect(result.outputs?.length).toBeGreaterThan(0);
  const view = describeInstance(instance, result, { x: 'Hz', y: inputs.traces[0]?.units.y }, { paneOrder: ['p1'], paneId: 'p1', traceName: peak.name, lineType: 'v' });
  expect(view.message).toBeUndefined();
  return view;
}

describe('analysis card results', () => {
  it('formats range statistics and explains an empty visible range', () => {
    const instance = createInstance('a', 'range-stats', { traceId: trace.id }, { range: 'visible' });
    if (!instance) throw new Error('missing instance');
    const result = computeInstance(instance, { traces: [trace], visibleRange: { left: 0, right: 2 } });
    expect(result.outputs?.length).toBeGreaterThan(0);
    expect(describeInstance(instance, result, { x: 'Hz', y: null }).numbers?.rows.map(row => row.label)).toContain('Maximum');
    expect(computeInstance(instance, { traces: [trace], visibleRange: { left: 10, right: 20 } }).reason).toBeTruthy();
    expect(computeInstance(instance, { traces: [] }).reason).toBeTruthy();
    expect(computeInstance(instance, { traces: [trace], visibleRange: null }).outputs?.length).toBeGreaterThan(0);
    expect(computeInstance(instance, { traces: [trace], visibleRange: { left: 2, right: 1 } }).outputs?.length).toBeGreaterThan(0);
  });
  it('shows noise PSD rows', () => expect(card('noise-psd', { traces: [peak] }).numbers?.rows.map(row => row.label)).toContain('Peak density'));
  it('shows IP3 rows', () => expect(card('ip3', { traces: [peak], markers }).numbers?.rows.map(row => row.label)).toContain('IIP3'));
  it('shows peak rows', () => expect(card('peak-table', { traces: [peak] }).numbers?.rows[0]?.label).toContain('#1'));
  it('shows bandwidth', () => expect(card('bandwidth', { traces: [peak] }).numbers?.rows[0]?.label).toBe('Reference'));
  it('shows threshold crossings', () => expect(card('crossings', { traces: [peak] }, { level: 3 }).crossings?.total).toBe(2));
  it('shows line crossings', () => expect(card('line-crossings', { traces: [peak], lines: [line], tracePaneMap: { [peak.name]: ['p1'] }, vis: { [peak.name]: true } }).crossings?.total).toBe(1));
  it('shows ripple', () => expect(card('ripple', { traces: [peak] }).numbers?.rows.map(row => row.label)).toContain('Maximum'));
  it('shows occupied bandwidth', () => expect(card('occupied-bandwidth', { traces: [peak] }, { percent: 50 }).numbers?.result?.note).toContain('%'));
  it('shows channel power for the full span at zero bandwidth', () => {
    const density = { ...peak, units: { x: 'Hz', y: 'dBm/Hz' } };
    expect(card('channel-power', { traces: [density] }, { bandwidthHz: 0 }).numbers?.result?.note).toContain('dBW');
  });
  it('shows reciprocity', () => expect(card('reciprocity-isolation', { traces: [peak], touchstone }).numbers?.rows.map(row => row.label)).toContain('Worst isolation'));
  it('shows stability', () => expect(card('stability', { traces: [peak], touchstone }).numbers?.rows.map(row => row.label)).toContain('Min K'));
  it('explains a peak search with no peaks and missing data', () => {
    const flat = { ...peak, data: [] };
    const peaks = createInstance('a', 'peak-table', { traceId: flat.id });
    const noise = createInstance('b', 'noise-psd', { traceId: flat.id });
    if (!peaks || !noise) throw new Error('missing instance');
    expect(computeInstance(peaks, { traces: [flat] }).reason).toBe('No peaks found.');
    expect(describeInstance(noise, computeInstance(noise, { traces: [flat] }), { x: 'Hz', y: 'dBm' }).message).toBeTruthy();
  });
  it('explains missing bandwidth edges and empty power data', () => {
    const flat = { ...peak, data: [{ freq: 0, amp: 0 }, { freq: 1, amp: 0 }] };
    const bandwidth = createInstance('a', 'bandwidth', { traceId: flat.id });
    const density = { ...flat, data: [], units: { x: 'Hz', y: 'dBm/Hz' } };
    const power = createInstance('b', 'channel-power', { traceId: density.id });
    if (!bandwidth || !power) throw new Error('missing instance');
    expect(computeInstance(bandwidth, { traces: [flat] }).reason).toBeTruthy();
    expect(computeInstance(power, { traces: [density] }).reason).toBeTruthy();
  });
  it('renders an empty crossings list', () => {
    expect(card('crossings', { traces: [peak] }, { level: 100 }).crossings?.total).toBe(0);
  });
});
