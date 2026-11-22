import { expect, it } from 'vitest';
import { chartGainView } from '../../src/domain/chart/gain-view';
import { makeTestTrace } from './helpers';

it('converts referenced decibel gain to power ratios while retaining the source samples', () => {
  const traces = [makeTestTrace({ units: { x: 'deg', y: 'dBi' }, data: [{ freq: 0, amp: -10 }, { freq: 30, amp: 10 }] })];
  expect(chartGainView(traces, undefined).traces).toBe(traces);
  const view = chartGainView(traces, 'linear');
  expect(view.traces[0]?.units.y).toBe('ratio');
  expect(view.traces[0]?.data.map(point => point.amp)).toEqual([0.1, 10]);
  expect(view.toSource(0.1)).toBe(-10);
  expect(traces[0]?.data[0]?.amp).toBe(-10);
});

it('converts power ratios to decibels and keeps incompatible pane units in their native view', () => {
  const pattern = makeTestTrace({ units: { x: 'rad', y: 'ratio' }, data: [{ freq: 0, amp: 0 }, { freq: 1, amp: 100 }] });
  const view = chartGainView([pattern], 'db');
  expect(view.traces[0]?.units.y).toBe('dB');
  expect(view.traces[0]?.data.map(point => point.amp)).toEqual([NaN, 20]);
  const mixed = [pattern, makeTestTrace({ units: { x: 'rad', y: 'V' } })];
  expect(chartGainView(mixed, 'db')).toMatchObject({ mode: null, traces: mixed });
});
