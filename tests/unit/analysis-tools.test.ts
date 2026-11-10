import { describe, expect, it } from 'vitest';
import { peakTableTool } from '../../src/domain/analysis/tools/peak-table';
import { rangeStatsTool } from '../../src/domain/analysis/tools/range-stats';
import { bandwidthTool } from '../../src/domain/analysis/tools/bandwidth';
import { crossingsTool } from '../../src/domain/analysis/tools/crossings';
import { rippleTool } from '../../src/domain/analysis/tools/ripple';
import { channelPowerTool } from '../../src/domain/analysis/tools/channel-power';
import { occupiedBandwidthTool } from '../../src/domain/analysis/tools/occupied-bandwidth';
import { offsetScaleTool } from '../../src/domain/analysis/tools/offset-scale';
import { smoothTool } from '../../src/domain/analysis/tools/smooth';
import { traceMathTool } from '../../src/domain/analysis/tools/trace-math';
import { stabilityTool } from '../../src/domain/analysis/tools/stability';
import { noisePsdTool } from '../../src/domain/analysis/tools/noise-psd';
import { ip3Tool } from '../../src/domain/analysis/tools/ip3';
import { lineCrossingsTool } from '../../src/domain/analysis/tools/line-crossings';
import { reciprocityIsolationTool } from '../../src/domain/analysis/tools/reciprocity-isolation';
import { computeStabilityFactors } from '../../src/domain/analysis/touchstone';
import type { TouchstoneContext } from '../../src/types/analysis';
import type { TouchstoneNetwork } from '../../src/types/touchstone';
import { makeTestTrace } from './helpers';

describe('analysis tools', () => {
  const trace = makeTestTrace({ data: [{ freq: 0, amp: 0 }, { freq: 1, amp: 6 }, { freq: 2, amp: 0 }] });
  it('computes noise, marker IP3, and line intersections', () => {
    expect(noisePsdTool.compute({ traces: [trace] }, { filter: 'flattop' })[0]).toMatchObject({ values: { peak: 6, avg: 2, min: 0, rbw: 1 } });
    const markers = ['F1', 'F2', 'IM3L', 'IM3U'].map((label, index) => ({ id: String(index), freq: index + 1, amp: index < 2 ? 0 : -20, trace: trace.name, type: 'normal' as const, label, refId: null, interpolated: false }));
    expect(ip3Tool.compute({ traces: [trace], markers }, { gain: 5 })[0]).toMatchObject({ values: { oip3_avg: 10, iip3: 5 } });
    const line = { id: 1, type: 'v' as const, paneIds: ['p1'], value: 0.5, label: null };
    expect(lineCrossingsTool.compute({ traces: [{ ...trace, interpolation: 'linear' }], lines: [line], lineId: 1, tracePaneMap: { [trace.name]: ['p1'] }, vis: { [trace.name]: true } }, {})[0]).toMatchObject({ rows: [['p1', trace.name, 3]] });
  });
  it('computes peaks, range, bandwidth, crossings and ripple', () => {
    expect(peakTableTool.compute({ traces: [trace] }, { minSpacingHz: 0, count: 10 })[0]).toMatchObject({ rows: [[1, 1, 6]] });
    expect(rangeStatsTool.compute({ traces: [trace], visibleRange: { left: 0, right: 1 } }, { range: 'visible' })[0]).toMatchObject({ values: { min: 0, max: 6, average: 3, count: 2, span: 1 } });
    expect(rangeStatsTool.compute({ traces: [trace], visibleRange: { left: 0, right: 1 } }, { range: 'all' })[0]).toMatchObject({ values: { average: 2, count: 3, span: 2 } });
    expect(bandwidthTool.compute({ traces: [trace] }, { drop: 3 })[0]).toMatchObject({ values: { bandwidth: 1, centre: 1, left: 0.5, right: 1.5 } });
    expect(crossingsTool.compute({ traces: [trace] }, { level: 3 })[0]).toMatchObject({ rows: [[0.5], [1.5]] });
    expect(rippleTool.compute({ traces: [trace] }, {})[0]).toMatchObject({ values: { ripple: 6, min: 0, max: 6, span: 2 } });
  });
  it('integrates a flat power spectrum and checks units', () => {
    const data = [{ freq: 0, amp: 0 }, { freq: 1, amp: 0 }, { freq: 2, amp: 0 }];
    const power = makeTestTrace({ data, units: { x: 'Hz', y: 'dBm' } });
    const density = makeTestTrace({ data, units: { x: 'Hz', y: 'dBm/Hz' } });
    const obw = occupiedBandwidthTool.compute({ traces: [power] }, { percent: 50 })[0];
    expect(obw).toMatchObject({ values: { lower: 0.5, upper: 1.5, bandwidth: 1 } });
    const channel = channelPowerTool.compute({ traces: [density] }, { bandwidthHz: 2 })[0];
    if (channel?.type !== 'numbers') throw new Error('Expected channel power');
    expect(channel.values.powerDbm).toBeCloseTo(10 * Math.log10(2));
    expect(channelPowerTool.appliesTo(power)).toEqual({ allowed: false, reason: 'Select a trace with spectral density units (dBm/Hz or dBW/Hz).' });
  });
  it('offsets, scales, smooths and combines traces', () => {
    const transformed = offsetScaleTool.compute({ traces: [trace] }, { offset: 1, scale: 2 })[0];
    if (transformed?.type !== 'trace') throw new Error('Expected trace');
    expect(transformed.trace.data.map(p => p.amp)).toEqual([1, 13, 1]);
    const smooth = smoothTool.compute({ traces: [trace] }, { method: 'moving-average', window: 3, sgOrder: 2 })[0];
    if (smooth?.type !== 'trace') throw new Error('Expected trace');
    expect(smooth.trace.data.map(p => p.amp)).toEqual([3, 2, 3]);
    const b = makeTestTrace({ id: 'b', data: [{ freq: 0, amp: 2 }, { freq: 1, amp: 0 }, { freq: 2, amp: 2 }] });
    for (const [operation, expected] of [['add', [2, 6, 2]], ['subtract', [-2, 6, -2]], ['multiply', [0, 0, 0]], ['divide', [0, 0]]] as const) {
      const output = traceMathTool.compute({ traces: [trace, b] }, { operation })[0];
      if (output?.type !== 'trace') throw new Error('Expected trace');
      expect(output.trace.data.map(p => p.amp)).toEqual(expected);
    }
  });
  it('computes delta magnitude for a two-port', () => {
    const network: TouchstoneNetwork = { parameterType: 'S', portCount: 2, referenceOhms: [50, 50], freqUnit: 'Hz', dataFormat: 'RI', comments: [], matrixFormat: 'full', version: 1, samples: [{ freq: 1, sMatrix: [[{ re: 0.2, im: 0 }, { re: 0.1, im: 0 }], [{ re: 0.5, im: 0 }, { re: 0.3, im: 0 }]] }] };
    const context = { network } as TouchstoneContext;
    const result = computeStabilityFactors(context);
    expect(result?.minDelta.value).toBeCloseTo(0.01);
    expect(result?.maxDelta.value).toBeCloseTo(0.01);
    const output = stabilityTool.compute({ traces: [], touchstone: context }, {})[0];
    if (output?.type !== 'numbers') throw new Error('Expected stability');
    expect(output.values.minDelta).toBeCloseTo(0.01);
    const reciprocity = reciprocityIsolationTool.compute({ traces: [], touchstone: context }, {})[0];
    if (reciprocity?.type !== 'numbers') throw new Error('Expected reciprocity');
    expect(reciprocity.values.reciprocityError).toBeCloseTo(20 * Math.log10(5));
    expect(reciprocity.values.worstIsolationDb).toBeCloseTo(-20 * Math.log10(0.5));
  });
});
