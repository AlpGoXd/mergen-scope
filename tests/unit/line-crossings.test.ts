import { describe, expect, it } from 'vitest';
import { computeHorizontalIntersections, computeLineIntersections, computeVerticalIntersections } from '../../src/domain/ref-lines';
import type { RefLine } from '../../src/types/ref-line';
import { makeTestTrace } from './helpers';

const line = (updates: Partial<RefLine> = {}): RefLine => ({ id: 1, type: 'v', value: 5, paneId: 'pane-1', groupId: null, label: null, ...updates });

describe('reference line crossings', () => {
  it('respects interpolation and data bounds for vertical lines', () => {
    const trace = makeTestTrace({ interpolation: 'linear' });
    expect(computeVerticalIntersections(5, [trace], 'pane-1')).toEqual([{ traceName: trace.name, paneId: 'pane-1', freq: 5, amp: 5 }]);
    expect(computeVerticalIntersections(-1, [trace], 'pane-1')).toEqual([]);
    expect(computeVerticalIntersections(20, [trace], 'pane-1')[0]?.amp).toBe(0);
  });
  it('reports interpolated, exact and plateau sample hits once each', () => {
    const trace = makeTestTrace({ data: [{freq: 0, amp: -1}, {freq: 1, amp: 0}, {freq: 2, amp: 0}, {freq: 3, amp: 1}, {freq: 4, amp: -1}] });
    expect(computeHorizontalIntersections(0, [trace], 'pane-1').map(point => point.freq)).toEqual([1, 2, 3.5]);
  });
  it('includes visible members in linked panes and updates with membership, visibility and line value', () => {
    const a = makeTestTrace({ name: 'a', interpolation: 'linear' });
    const b = makeTestTrace({ name: 'b', interpolation: 'linear' });
    const first = line({groupId: 'g'});
    const second = line({id: 2, paneId: 'pane-2', groupId: 'g'});
    const map = { a: ['pane-1', 'pane-2'], b: ['pane-2'] };
    expect(computeLineIntersections(first, [first, second], [a, b], map, {a: true, b: false}).map(p => p.paneId)).toEqual(['pane-1', 'pane-2']);
    expect(computeLineIntersections({...first, value: 10}, [{...first, value: 10}, second], [a, b], map, {a: true, b: true}).map(p => [p.traceName, p.paneId, p.freq])).toEqual([['a', 'pane-1', 10], ['a', 'pane-2', 5], ['b', 'pane-2', 5]]);
    expect(computeLineIntersections(line({type: 'h'}), [line({type: 'h'})], [a, b], map, {a: true, b: true}).map(p => p.freq)).toEqual([5, 15]);
  });
  it('reports no crossings for a line whose pane was removed (paneless)', () => {
    const a = makeTestTrace({ name: 'a', interpolation: 'linear' });
    const orphan = line({ paneId: null, paneless: true });
    expect(computeLineIntersections(orphan, [orphan], [a], { a: ['pane-1'] }, { a: true })).toEqual([]);
  });
});
