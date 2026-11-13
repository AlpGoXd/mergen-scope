import { expect, it } from 'vitest';
import { computeInstance, createInstance } from '../../src/domain/analysis/instances';
import { makeTestTrace } from './helpers';

const trace = makeTestTrace({ id: 'shape-trace', name: 'shape-trace', data: [{ freq: 0, amp: -10 }, { freq: 1, amp: 0 }, { freq: 2, amp: -10 }] });
const shapes = (toolId: string, source = trace) => {
  const instance = createInstance('analysis-1', toolId, { traceId: source.id });
  if (!instance) throw new Error('missing instance');
  const output = computeInstance(instance, { traces: [source] }).outputs?.find(item => item.type === 'shapes');
  return output?.type === 'shapes' ? output.shapes : [];
};

it('emits peak triangles, bandwidth ticks and a ripple band', () => {
  expect(shapes('peak-table')).toContainEqual({ kind: 'triangle', x: 1, y: 0, n: 1 });
  expect(shapes('bandwidth')).toEqual([{ kind: 'band', x1: 0.7, x2: 1.3 }, { kind: 'tick', x: 0.7, y: -3 }, { kind: 'tick', x: 1.3, y: -3 }]);
  expect(shapes('ripple')).toEqual([{ kind: 'band', x1: 0, x2: 2, y1: -10, y2: 0 }]);
});

it('emits bands for power tools and dots for threshold crossings', () => {
  expect(shapes('occupied-bandwidth').map(shape => shape.kind)).toEqual(['band']);
  expect(shapes('channel-power', { ...trace, units: { x: 'Hz', y: 'dBm/Hz' } }).map(shape => shape.kind)).toEqual(['band']);
  expect(shapes('crossings')).toContainEqual({ kind: 'dot', x: 1, y: 0 });
});

it('emits no shapes for empty traces', () => {
  const empty = { ...trace, data: [] };
  for (const tool of ['peak-table', 'bandwidth', 'ripple', 'occupied-bandwidth', 'channel-power', 'crossings']) expect(shapes(tool, empty)).toEqual([]);
});

it('emits dots at reference line intersections and none for a missing line', () => {
  const instance = createInstance('analysis-1', 'line-crossings', { traceId: null, lineId: 1 });
  if (!instance) throw new Error('missing instance');
  const line = { id: 1, type: 'v' as const, paneIds: ['pane-1'], value: 0.5, label: null };
  const input = { traces: [{ ...trace, interpolation: 'linear' as const }], lines: [line], tracePaneMap: { [trace.name]: ['pane-1'] }, vis: { [trace.name]: true } };
  expect(computeInstance(instance, input).outputs?.find(output => output.type === 'shapes')).toEqual({ type: 'shapes', shapes: [{ kind: 'dot', x: 0.5, y: -5 }] });
  expect(computeInstance(instance, { ...input, lines: [] }).outputs).toBeUndefined();
});
