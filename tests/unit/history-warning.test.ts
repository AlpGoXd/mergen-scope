import { describe, expect, it } from 'vitest';
import { createTransactionHistory } from '../../src/domain/transaction-history';
import { initialWorkspaceEngine, workspaceEngineReducer, type WorkspaceEngine } from '../../src/stores/aggregate-workspace-store';

const setGain = (engine: WorkspaceEngine, value: string) => workspaceEngineReducer(engine, {
  type: 'change', toastMessage: 'Updated trace panes',
  command: { slice: 'ui', action: { type: 'SET', payload: { key: 'ip3Gain', value } } },
});

describe('history notices', () => {
  it('does not report a limit eviction when a new action discards redo after undo', () => {
    let engine = setGain(initialWorkspaceEngine(), '1');
    engine = setGain(engine, '2');
    engine = workspaceEngineReducer(engine, { type: 'undo' });
    expect(engine.history.future).toHaveLength(1);
    engine = setGain(engine, '3');
    expect(engine.history.future).toHaveLength(0);
    expect(engine.history.past).toHaveLength(2);
    expect(engine.historyNotice).toBeNull();
    expect(engine.toastMessage).toBe('Updated trace panes');
    engine = workspaceEngineReducer(engine, { type: 'undo' });
    expect(engine.present.ui.ip3Gain).toBe('1');
  });

  it('still reports actual oldest undo eviction at the entry limit', () => {
    const initial = initialWorkspaceEngine();
    let engine = { ...initial, history: createTransactionHistory<typeof initial.history.past[number]['before']>({ maxEntries: 1 }) };
    engine = setGain(engine, '1');
    engine = setGain(engine, '2');
    expect(engine.history.past).toHaveLength(1);
    expect(engine.historyNotice).toBe('pruned');
  });

  it('does not report normal redo invalidation when committing a gesture', () => {
    let engine = setGain(initialWorkspaceEngine(), '1');
    engine = setGain(engine, '2');
    engine = workspaceEngineReducer(engine, { type: 'undo' });
    engine = workspaceEngineReducer(engine, { type: 'begin-gesture' });
    engine = setGain(engine, '3');
    engine = workspaceEngineReducer(engine, { type: 'commit-gesture' });
    expect(engine.history.future).toHaveLength(0);
    expect(engine.historyNotice).toBeNull();
    engine = workspaceEngineReducer(engine, { type: 'undo' });
    expect(engine.present.ui.ip3Gain).toBe('1');
  });

  it('reports a byte-limit eviction when undo makes the redo state history-only', () => {
    const initial = initialWorkspaceEngine();
    let engine = { ...initial, history: createTransactionHistory<typeof initial.history.past[number]['before']>({ maxBytes: 10_000 }) };
    engine = setGain(engine, 'x'.repeat(20_000));
    expect(engine.history.past).toHaveLength(1);
    engine = workspaceEngineReducer(engine, { type: 'undo' });
    expect(engine.history.future).toHaveLength(0);
    expect(engine.historyNotice).toBe('pruned');
    expect(engine.present.ui.ip3Gain).toBe(initial.present.ui.ip3Gain);
  });

  it('reports a byte-limit eviction when redo makes the undo state history-only', () => {
    let engine = setGain(initialWorkspaceEngine(), 'x'.repeat(20_000));
    engine = setGain(engine, 'small');
    engine = workspaceEngineReducer(engine, { type: 'undo' });
    engine = { ...engine, history: { ...engine.history, limits: { ...engine.history.limits, maxBytes: 10_000 } } };
    engine = workspaceEngineReducer(engine, { type: 'redo' });
    expect(engine.history.past).toHaveLength(0);
    expect(engine.historyNotice).toBe('pruned');
    expect(engine.present.ui.ip3Gain).toBe('small');
  });
});
