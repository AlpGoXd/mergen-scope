import { describe, expect, it } from 'vitest';
import { defaultTraceForPane } from '../../src/domain/default-trace';
import { makeTestTrace } from './helpers';

describe('default trace', () => {
  const traces = [makeTestTrace({ name: 'a' }), makeTestTrace({ name: 'b' }), makeTestTrace({ name: 'c' })];
  const panes = { a: ['pane-1'], b: ['pane-2'], c: ['pane-2'] };
  it('prefers selection, then a visible trace in the pane', () => {
    expect(defaultTraceForPane(traces, 'a', 'pane-2', panes, {})?.name).toBe('a');
    expect(defaultTraceForPane(traces, null, 'pane-2', panes, { b: false })?.name).toBe('c');
  });
  it('falls back globally and returns null when all traces are hidden', () => {
    expect(defaultTraceForPane(traces, null, 'empty', panes, { a: false })?.name).toBe('b');
    expect(defaultTraceForPane(traces, null, 'pane-1', panes, { a: false, b: false, c: false })).toBeNull();
  });
});
