import { describe, expect, it } from 'vitest';
import { orderTracesForList } from '../../src/domain/trace-order';
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
});
