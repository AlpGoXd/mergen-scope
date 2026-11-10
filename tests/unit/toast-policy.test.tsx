import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTransactionHistory } from '../../src/domain/transaction-history';
import { initialWorkspaceEngine, workspaceEngineReducer } from '../../src/stores/aggregate-workspace-store';
import type { ToastKind } from '../../src/stores/toast-store';
import { ToastProvider, useToast } from '../../src/stores/toast-store';
import { makeTestTrace } from './helpers';

const setGain = (engine: ReturnType<typeof initialWorkspaceEngine>, value: string, extra: { toastMessage?: string; toastKind?: ToastKind } = {}) =>
  workspaceEngineReducer(engine, { type: 'change', ...extra, command: { slice: 'ui', action: { type: 'SET', payload: { key: 'ip3Gain', value } } } });

describe('toast policy at the source', () => {
  it('raises a toast only for delete, close, apply-all, moved and opened', () => {
    for (const toastKind of ['delete', 'close', 'apply-all', 'moved', 'opened'] as const) {
      expect(setGain(initialWorkspaceEngine(), `v-${toastKind}`, { toastMessage: `msg ${toastKind}`, toastKind }).toastMessage).toBe(`msg ${toastKind}`);
    }
  });

  it('stays silent for any change without a toast kind (markers, lines, toggles, renames)', () => {
    expect(setGain(initialWorkspaceEngine(), '1', { toastMessage: 'Renamed trace' }).toastMessage).toBeUndefined();
    expect(setGain(initialWorkspaceEngine(), '1').toastMessage).toBeUndefined();
  });

  it('never raises a toast for Undo or Redo', () => {
    let engine = setGain(initialWorkspaceEngine(), '1', { toastMessage: 'Closed a file', toastKind: 'close' });
    engine = workspaceEngineReducer(engine, { type: 'undo' });
    expect(engine.toastMessage).toBeUndefined();
    engine = workspaceEngineReducer(engine, { type: 'redo' });
    expect(engine.toastMessage).toBeUndefined();
  });

  it('keeps created traces silent and gives peak-table add all its apply-all toast', () => {
    const a = makeTestTrace({ id: 'a', name: 'a' });
    const b = makeTestTrace({ id: 'b', name: 'b' });
    let engine = workspaceEngineReducer(initialWorkspaceEngine(), { type: 'change', command: { slice: 'files', action: { type: 'ADD_PARSED_FILE', payload: { id: 'f', fileName: 'f.dat', text: '', parsed: { format: 'rs-dat', meta: {}, traces: [a, b] } } } } });
    engine = { ...engine, present: { ...engine.present, files: { ...engine.present.files, files: engine.present.files.files.map(file => ({ ...file, traces: [a, b], datasets: [], displayTraces: [] })) } } };
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'analysis', action: { type: 'ADD_ANALYSIS', payload: { toolId: 'trace-math', source: { traceId: 'a', secondTraceId: 'b' } } } } });
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'analysis', action: { type: 'CREATE_ANALYSIS_OUTPUT', payload: { id: 'analysis-1' } } } });
    expect(engine.present.traces.derivedTraces).toHaveLength(1);
    expect(engine.toastMessage).toBeUndefined();
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'analysis', action: { type: 'FREEZE_ANALYSIS_COPY', payload: { id: 'analysis-1' } } } });
    expect(engine.present.traces.derivedTraces).toHaveLength(2);
    expect(engine.toastMessage).toBeUndefined();
    engine = workspaceEngineReducer(engine, { type: 'change', toastKind: 'apply-all', toastMessage: 'Added markers', command: { slice: 'markers', action: { type: 'PLACE_MARKERS', payload: { trace: a, targetFreqs: [0, 10] } } } });
    expect(engine.toastMessage).toBe('Added markers');
  });

  it('drops the oldest step silently when the history is full: no toast text of any kind', () => {
    const initial = initialWorkspaceEngine();
    let engine = { ...initial, history: createTransactionHistory<typeof initial.history.past[number]['before']>({ maxEntries: 1 }) };
    engine = setGain(engine, '1');
    engine = setGain(engine, '2');
    expect(engine.history.past).toHaveLength(1);
    expect(engine.toastMessage).toBeUndefined();
  });
});

describe('toast host', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function Fire({ messages, kind }: { messages: string[]; kind?: 'info' | 'error' }) {
    const { show } = useToast();
    return <button onClick={() => messages.forEach(message => show({ message, ...(kind ? { kind } : {}) }))}>fire</button>;
  }

  it('shows one toast at a time: a new one replaces the current one', () => {
    render(<ToastProvider><Fire messages={['first', 'second']} /></ToastProvider>);
    act(() => screen.getByText('fire').click());
    expect(screen.queryByText('first')).toBeNull();
    expect(screen.getByText('second')).toBeTruthy();
    expect(document.querySelectorAll('.ui-toast')).toHaveLength(1);
  });

  it('closes after 5 seconds, but an error stays until dismissed', () => {
    const { unmount } = render(<ToastProvider><Fire messages={['info toast']} /></ToastProvider>);
    act(() => screen.getByText('fire').click());
    act(() => { vi.advanceTimersByTime(4900); });
    expect(screen.queryByText('info toast')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByText('info toast')).toBeNull();
    unmount();
    render(<ToastProvider><Fire messages={['failed']} kind="error" /></ToastProvider>);
    act(() => screen.getByText('fire').click());
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.queryByText('failed')).toBeTruthy();
    act(() => screen.getByLabelText('Dismiss notification').click());
    expect(screen.queryByText('failed')).toBeNull();
  });
});
