import { describe, expect, it } from 'vitest';
import { initialWorkspaceEngine, workspaceEngineReducer } from '../../src/stores/aggregate-workspace-store';
import { makeTestTrace } from './helpers';
import { makeComplexDisplayTrace } from '../../src/types/display';
import { defaultPaneState, paneReducer } from '../../src/stores/pane-store';

describe('pane type persistence', () => {
  it('keeps a compatible requested Smith mode when creating a pane with a trace', () => {
    const trace = makeTestTrace();
    const display = makeComplexDisplayTrace(trace.id, 'dataset', 'network', { sourceType: 'network-parameter', parameterFamily: 'S', basis: 'native', row: 0, col: 0, component: 'complex' }, [], { xUnit: 'Hz', semantics: 'network-parameter' });
    const state = { ...defaultPaneState, panes: defaultPaneState.panes.map(p => ({ ...p, renderMode: 'smith' as const, typed: true })) };
    const next = paneReducer(state, { type: 'CREATE_PANE_WITH_TRACE', limit: 4, payload: { trace, allTraces: [trace], displayTraces: [display] } });
    expect(next.panes[1]).toMatchObject({ renderMode: 'smith', typed: true });
  });
  it('starts panes untyped and restores a chosen type through undo and redo', () => {
    let engine = initialWorkspaceEngine();
    expect(engine.present.panes.panes[0]?.typed).toBe(false);
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'panes', limit: 4, action: { type: 'SET_RENDER_MODE', payload: { paneId: 'pane-1', mode: 'cartesian' } } } });
    expect(engine.present.panes.panes[0]?.typed).toBe(true);
    engine = workspaceEngineReducer(engine, { type: 'undo' });
    expect(engine.present.panes.panes[0]?.typed).toBe(false);
    engine = workspaceEngineReducer(engine, { type: 'redo' });
    expect(engine.present.panes.panes[0]?.typed).toBe(true);
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'panes', limit: 4, action: { type: 'SET_PANE_COUNT', payload: 3 } } });
    expect(engine.present.panes.panes.map(p => p.typed)).toEqual([true, false, false]);
  });

  it('keeps the type after removing the last membership or closing its file', () => {
    const trace = makeTestTrace({ name: 'one', id: 'one' });
    let engine = initialWorkspaceEngine();
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'files', action: { type: 'ADD_PARSED_FILE', payload: { id: 'f', fileName: 'f.dat', text: 'source', parsed: { format: 'rs-dat', meta: {}, traces: [trace] } } } } });
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'panes', limit: 4, action: { type: 'ADD_MEMBERSHIP', payload: { trace, targetPaneId: 'pane-1', allTraces: [trace] } } } });
    expect(engine.present.panes.panes[0]?.typed).toBe(true);
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'panes', limit: 4, action: { type: 'REMOVE_MEMBERSHIP', payload: { traceName: 'one', paneId: 'pane-1' } } } });
    expect(engine.present.panes.panes[0]?.typed).toBe(true);
    engine = workspaceEngineReducer(engine, { type: 'undo' });
    expect(engine.present.panes.tracePaneMap.one).toContain('pane-1');
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'files', action: { type: 'REMOVE_FILE', payload: { fileId: 'f' } } } });
    expect(engine.present.panes.panes[0]?.typed).toBe(true);
    expect(engine.present.panes.tracePaneMap.one).toBeUndefined();
  });
});
