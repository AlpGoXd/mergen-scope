import { computeOccupiedBandwidth, computeChannelPower } from '../../src/domain/analysis/channel-power';
import { placeMarker } from '../../src/domain/markers';
import { getVisibleTraceData } from '../../src/domain/trace-math';
import { sweepBands, sweepBreaks } from '../../src/domain/sweep-bands';
import { expect, it } from 'vitest';
import { chartAxisData, logTickLabel, logTicks, logXReason, logYReason, suggestLog, unwrapPhase } from '../../src/domain/chart/axis-scale';
import { panXDomain, pixelToAxisValue, wheelAxisDomain } from '../../src/domain/chart/plot-coords';
import { makeTestTrace } from './helpers';

it('draws decades, minor subdivisions, and short-range ticks with SI labels', () => {
  const ticks = logTicks({ min: 10000, max: 8.5e9 });
  expect(ticks.filter(tick => tick.label).map(tick => logTickLabel(tick.value))).toEqual(['10k', '100k', '1M', '10M', '100M', '1G']);
  expect(ticks.find(tick => tick.value === 90000)).toEqual({ value: 90000, major: false, label: false });
  expect(logTicks({ min: 10, max: 350 }).find(tick => tick.value === 50)?.label).toBe(true);
  const short = logTicks({ min: 20, max: 45 });
  expect(short.length).toBeGreaterThan(1);
  expect(short.every(tick => tick.label && tick.value >= 20 && tick.value <= 45)).toBe(true);
  expect(logTickLabel(0.002)).toBe('2m');
});

it('maps and zooms around the cursor using ratios and pans within positive bounds', () => {
  expect(pixelToAxisValue(50, 0, 100, 10, 1000, false, 'log')).toBeCloseTo(100);
  expect(panXDomain({ left: 10, right: 1000 }, 100, 10, { min: 1, max: 1e6 }, 'log')).toEqual({ left: 100, right: 10000 });
  const zoom = wheelAxisDomain({ min: 10, max: 1000 }, -1, 100, false, 'log');
  expect(zoom).not.toBeNull();
  expect((zoom?.min ?? 0) * (zoom?.max ?? 0)).toBeCloseTo(10000);
  expect(wheelAxisDomain({ min: 10, max: 1000 }, 1, null, true, 'log')?.min).toBeCloseTo(10 ** 1.3);
});

it('preserves gaps, counts omitted samples, unwraps successive phases and leaves source samples intact', () => {
  const data = [170, -170, -160, 170].map((amp, index) => ({ freq: index + 1, amp }));
  expect(unwrapPhase(data).map(point => point.amp)).toEqual([170, 190, 200, 170]);
  const trace = makeTestTrace({ data });
  const model = chartAxisData([trace], { x: 'linear', y: 'log', phase: 'wrapped' }, null);
  expect(model.omitted).toBe(2);
  expect(model.byTrace.get(trace.name)?.map(row => row[trace.name])).toEqual([170, undefined, undefined, 170]);
  expect(trace.data[1]?.amp).toBe(-170);
});

it('suggests log across three positive decades and explains incompatible axes', () => {
  expect(suggestLog({ min: 10000, max: 1e7 })).toBe(true);
  expect(suggestLog({ min: 10000, max: 9e6 })).toBe(false);
  expect(suggestLog({ min: 0, max: 9e6 })).toBe(false);
  expect(logXReason([makeTestTrace()])).toBe('X has values ≤ 0');
  expect(logYReason([makeTestTrace()])).toBe('dB is already logarithmic');
  expect(logYReason([makeTestTrace({ units: { x: 'Hz', y: '°' } })])).toBe("Phase can't be shown on a log axis");
  expect(logYReason([makeTestTrace({ units: { x: 'Hz', y: 's' }, parameters: { metric: 'group-delay' } })])).toBe("Group delay can't be shown on a log axis");
  expect(logYReason([makeTestTrace({ units: { x: 's', y: 'V' } })])).toBeUndefined();
  expect(logYReason([makeTestTrace({ units: { x: 'Hz', y: null } })])).toBe('Y needs a linear unit');
});

it('breaks multiband spectra at measured endpoints, including zoom windows wholly inside the gap', () => {
  const points = [880, 881, 882, 913, 915, 917].map(freq => ({ freq, amp: 1 }));
  const trace = makeTestTrace({ name: 'sweep', data: points, parameters: { sweepFormat: 'tinySA' }, units: { x: 'Hz', y: 'V' } });
  for (const y of ['linear', 'log'] as const) {
    const settings = { x: 'linear' as const, y, phase: 'wrapped' as const };
    const rows = chartAxisData([trace], settings, null).byTrace.get('sweep') ?? [];
    expect(rows.map(row => row.sweep)).toEqual([1, 1, 1, undefined, 1, 1, 1]);
    const gap = { left: 890, right: 910 };
    expect(chartAxisData([trace], settings, gap).byTrace.get('sweep')).toEqual([]);
    expect(getVisibleTraceData(trace, gap)).toEqual([]);
  }
  expect(sweepBands([1, 10, 100, 1000, 10000].map(freq => ({ freq, amp: 0 })))).toHaveLength(1);
  expect(sweepBands([0, 1, 2, 12, 22, 32].map(freq => ({ freq, amp: 0 })))).toHaveLength(1);
  expect(placeMarker({ ...trace, interpolation: 'linear' }, 890)).toMatchObject({ freq: 882, interpolated: false });
  const ordinary = makeTestTrace({ ...trace, parameters: null });
  expect(getVisibleTraceData(ordinary, { left: 890, right: 910 })).toHaveLength(2);
  const time = makeTestTrace({ ...ordinary, domain: 'time', family: 'waveform', units: { x: 's', y: 'V' } });
  expect(getVisibleTraceData(time, { left: 890, right: 910 })).toHaveLength(2);
});

it('integrates measured bandwidth without adding power from the unswept interval', () => {
  const trace = makeTestTrace({ parameters: { sweepFormat: 'tinySA' }, data: [0, 1, 2, 100, 101, 102].map(freq => ({ freq, amp: 0 })) });
  const breaks = sweepBreaks(trace);
  expect(computeChannelPower(trace.data, 'dBm/Hz', breaks).powerDbm).toBeCloseTo(10 * Math.log10(4));
  expect(computeOccupiedBandwidth(trace.data, 50, 'dBm', breaks)).toMatchObject({ lower: 1, upper: 101 });
});
