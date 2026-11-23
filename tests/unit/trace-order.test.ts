import { describe, expect, it } from 'vitest';
import { groupTracesForList, orderTracesForList } from '../../src/domain/trace-order';
import { createDerivedTrace } from '../../src/domain/trace-model';
import { makeTestTrace } from './helpers';

describe('trace list order', () => {
  const a = makeTestTrace({ id: 'a', file: 'first.dat' });
  const b = makeTestTrace({ id: 'b', file: 'second.dat' });
  const child = { ...createDerivedTrace(a, 'smooth', {}, a.data), id: 'child' };
  const math = { ...createDerivedTrace(a, 'add', {}, a.data), id: 'math', sourceTraceIds: ['a', 'b'] };
  const nested = { ...createDerivedTrace(child, 'smooth', {}, child.data), id: 'nested' };
  const orphan = { ...createDerivedTrace(a, 'smooth', {}, a.data), id: 'orphan', sourceTraceIds: ['missing'] };
  it('places children under the first parent, recursively, with orphans last', () => {
    expect(orderTracesForList([a, b, child, math, nested, orphan]).map(trace => trace.id)).toEqual(['a', 'child', 'nested', 'math', 'b', 'orphan']);
  });
  it('preserves order without derived traces', () => {
    expect(orderTracesForList([b, a])).toEqual([b, a]);
  });
  it('preserves manual order and places newly created traces with their source', () => {
    const c = makeTestTrace({ id: 'c' });
    expect(orderTracesForList([a, b, child, nested, c], ['missing', 'b', 'a']).map(trace => trace.id))
      .toEqual(['b', 'a', 'child', 'nested', 'c']);
    expect(orderTracesForList([a, b, child], ['child', 'b', 'a']).map(trace => trace.id))
      .toEqual(['b', 'a', 'child']);
  });
  it('regroups split saved orders and includes descendants in the root block', () => {
    const groups = groupTracesForList([a, b, child, math, nested, orphan], ['a', 'b', 'math', 'nested', 'child']);
    expect(groups.map(group => group.traces.map(trace => trace.id)))
      .toEqual([['a', 'math', 'child', 'nested'], ['b'], ['orphan']]);
  });
});
