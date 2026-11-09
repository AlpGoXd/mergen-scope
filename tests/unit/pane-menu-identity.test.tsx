import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Menu } from '../../src/components/left-panel/Menu';

it('keeps duplicate pane titles distinct when their stable IDs reorder', () => {
  const one = vi.fn();
  const two = vi.fn();
  const entries = [
    { id: 'pane-1', label: 'Shared title', checked: true, onSelect: one },
    { id: 'pane-2', label: 'Shared title', checked: false, onSelect: two },
  ];
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const { rerender } = render(<Menu label="Show in" checklist entries={entries} />);
    const original = screen.getAllByRole('menuitemcheckbox');
    expect(original[0]).toHaveAttribute('aria-checked', 'true');
    expect(original[1]).toHaveAttribute('aria-checked', 'false');
    rerender(<Menu label="Show in" checklist entries={[...entries].reverse()} />);
    const reordered = screen.getAllByRole('menuitemcheckbox');
    expect(reordered[0]).toBe(original[1]);
    expect(reordered[1]).toBe(original[0]);
    fireEvent.click(reordered[0]!);
    expect(two).toHaveBeenCalledOnce();
    expect(one).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  } finally { errors.mockRestore(); }
});

it('allocates from current state for queued creations and after undo', async () => {
  const { initialWorkspaceEngine, workspaceEngineReducer } = await import('../../src/stores/aggregate-workspace-store');
  const { makeTestTrace } = await import('./helpers');
  const trace = makeTestTrace();
  const initial = initialWorkspaceEngine();
  let engine = { ...initial, present: { ...initial.present, traces: { ...initial.present.traces, derivedTraces: [trace] }, panes: { ...initial.present.panes, tracePaneMap: { [trace.name]: ['pane-1'] } } } };
  const action = { type: 'change' as const, command: { slice: 'panes' as const, limit: 4 as const, action: { type: 'CREATE_PANE_WITH_TRACE' as const, payload: { trace, allTraces: [trace] } } } };
  engine = workspaceEngineReducer(engine, action);
  engine = workspaceEngineReducer(engine, action);
  expect(engine.present.panes.tracePaneMap[trace.name]).toEqual(['pane-1', 'pane-2', 'pane-3']);
  engine = workspaceEngineReducer(engine, { type: 'undo' });
  engine = workspaceEngineReducer(engine, action);
  expect(engine.present.panes.panes.map(pane => pane.id)).toEqual(['pane-1', 'pane-2', 'pane-4']);
  expect(engine.present.panes.tracePaneMap[trace.name]).toEqual(['pane-1', 'pane-2', 'pane-4']);
  engine = workspaceEngineReducer(engine, action);
  const full = engine;
  engine = workspaceEngineReducer(engine, action);
  expect(engine.present).toBe(full.present);
  const stale = { ...action, command: { ...action.command, action: { ...action.command.action, payload: { trace: makeTestTrace({ id: 'missing' }), allTraces: [] } } } };
  expect(workspaceEngineReducer(initial, stale).present).toBe(initial.present);
});

it('falls back from Smith to a compatible chart for a new pane', async () => {
  const { defaultPaneState, paneReducer } = await import('../../src/stores/pane-store');
  const { makeTestTrace } = await import('./helpers');
  const trace = makeTestTrace();
  const state = { ...defaultPaneState, panes: defaultPaneState.panes.map(pane => ({ ...pane, renderMode: 'smith' as const })) };
  const next = paneReducer(state, { type: 'CREATE_PANE_WITH_TRACE', limit: 4, payload: { trace, allTraces: [trace] } });
  expect(next.panes[1]?.renderMode).toBe('cartesian');
  expect(next.tracePaneMap[trace.name]).toEqual(['pane-2']);
});

it('permits eight panes only with the experimental limit and stops at eight', async () => {
  const { defaultPaneState, paneReducer } = await import('../../src/stores/pane-store');
  const { makeTestTrace } = await import('./helpers');
  const trace = makeTestTrace();
  const action = { type: 'CREATE_PANE_WITH_TRACE' as const, limit: 8 as const, payload: { trace, allTraces: [trace] } };
  let state = defaultPaneState;
  for (let i = 2; i <= 8; i++) {
    state = paneReducer(state, action);
    expect(state.panes).toHaveLength(i);
    expect(state.tracePaneMap[trace.name]).toContain(`pane-${i}`);
  }
  expect(paneReducer(state, action)).toBe(state);
});

it('preserves Smith for a compatible reflection trace in a new pane', async () => {
  const { defaultPaneState, paneReducer } = await import('../../src/stores/pane-store');
  const { makeComplexDisplayTrace } = await import('../../src/types/display');
  const { makeTestTrace } = await import('./helpers');
  const trace = makeTestTrace();
  const display = makeComplexDisplayTrace(trace.id, 'dataset', 'network', { sourceType: 'network-parameter', parameterFamily: 'S', basis: 'native', row: 0, col: 0, component: 'complex' }, [], { xUnit: 'Hz', semantics: 'network-parameter' });
  const state = { ...defaultPaneState, panes: defaultPaneState.panes.map(pane => ({ ...pane, renderMode: 'smith' as const })) };
  const next = paneReducer(state, { type: 'CREATE_PANE_WITH_TRACE', limit: 4, payload: { trace, allTraces: [trace], displayTraces: [display] } });
  expect(next.panes[1]?.renderMode).toBe('smith');
  expect(next.tracePaneMap[trace.name]).toEqual(['pane-2']);
});
