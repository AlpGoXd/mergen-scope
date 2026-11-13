import { describe, expect, it } from 'vitest';
import { addLinePane, removeLinePane } from '../../src/domain/ref-lines';
import { defaultPaneSettings } from '../../src/types/pane';
import type { RefLine } from '../../src/types/ref-line';
import { initialWorkspaceEngine, workspaceEngineReducer } from '../../src/stores/aggregate-workspace-store';
import { makeTestTrace } from './helpers';

const panes = ['pane-1', 'pane-2', 'pane-3'].map(id => ({ id, title: id, renderMode: 'cartesian' as const, typed: true, settings: defaultPaneSettings() }));
const hz = makeTestTrace({ name: 'hz', units: { x: 'Hz', y: 'dB' } });
const time = makeTestTrace({ name: 'time', domain: 'time', family: 'waveform', units: { x: 's', y: 'V' } });
const entries = [{ trace: hz, paneIds: ['pane-1', 'pane-2'] }, { trace: time, paneIds: ['pane-3'] }];
const line: RefLine = { id: 1, type: 'v', value: 5, label: 'V1', paneIds: ['pane-1'] };

describe('line pane memberships', () => {
  it('never adds a line to other panes by itself: a new pane gets no lines and a line keeps only the pane it was placed in', () => {
    let state = initialWorkspaceEngine().present;
    state = workspaceEngineReducer({ ...initialWorkspaceEngine(), present: state }, { type: 'change', command: { slice: 'panes', limit: 4, action: { type: 'SET_PANE_COUNT', payload: 2, limit: 4 } } }).present;
    const placed = workspaceEngineReducer({ ...initialWorkspaceEngine(), present: state }, { type: 'change', command: { slice: 'lines', action: { type: 'ADD_LINE', payload: { id: 1, type: 'v', value: 5, label: 'V1', paneIds: ['pane-1'] } } } }).present;
    const more = workspaceEngineReducer({ ...initialWorkspaceEngine(), present: placed }, { type: 'change', command: { slice: 'panes', limit: 4, action: { type: 'SET_PANE_COUNT', payload: 4, limit: 4 } } }).present;
    expect(more.panes.panes).toHaveLength(4);
    expect(more.lines.refLines.map(item => item.paneIds)).toEqual([['pane-1']]);
  });

  it('rejects incompatible panes and horizontal extensions with a reason', () => {
    const incompatible = addLinePane(line, 'pane-3', panes, entries);
    expect(incompatible.result.allowed).toBe(false);
    if (!incompatible.result.allowed) expect(incompatible.result.reason).toBeTruthy();
    const horizontal = addLinePane({ ...line, type: 'h' }, 'pane-2', panes, entries);
    expect(horizontal.result.allowed).toBe(false);
    expect(horizontal.line.paneIds).toEqual(['pane-1']);
  });

  it('removes one pane and keeps the last removal as an unplaced line', () => {
    const both = addLinePane(line, 'pane-2', panes, entries).line;
    const one = removeLinePane(both, 'pane-1');
    expect(one.paneIds).toEqual(['pane-2']);
    expect(removeLinePane(one, 'pane-2', 'Hz')).toMatchObject({ id: 1, paneIds: [], axisUnit: 'Hz' });
  });

  it('does not add existing lines when a new pane is created', () => {
    let engine = initialWorkspaceEngine();
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'lines', action: { type: 'ADD_LINE', payload: line } } });
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'panes', limit: 4, action: { type: 'SET_PANE_COUNT', payload: 2 } } });
    expect(engine.present.lines.refLines[0]?.paneIds).toEqual(['pane-1']);
  });

  it('undoes add, value edits, membership changes and deletion', () => {
    let engine = initialWorkspaceEngine();
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'lines', action: { type: 'ADD_LINE', payload: line } } });
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'lines', action: { type: 'ADD_LINE_PANE', payload: { lineId: 1, paneId: 'pane-2', panes, entries } } } });
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'lines', action: { type: 'UPDATE_LINE', payload: { id: 1, updates: { value: 10 } } } } });
    expect(engine.present.lines.refLines).toMatchObject([{ id: 1, value: 10, paneIds: ['pane-1', 'pane-2'] }]);
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'lines', action: { type: 'REMOVE_LINE_PANE', payload: { lineId: 1, paneId: 'pane-2' } } } });
    expect(engine.present.lines.refLines[0]?.paneIds).toEqual(['pane-1']);
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'lines', action: { type: 'REMOVE_LINE', payload: 1 } } });
    expect(engine.present.lines.refLines).toEqual([]);
    engine = workspaceEngineReducer(engine, { type: 'undo' });
    expect(engine.present.lines.refLines[0]?.value).toBe(10);
    engine = workspaceEngineReducer(engine, { type: 'undo' });
    expect(engine.present.lines.refLines[0]?.paneIds).toEqual(['pane-1', 'pane-2']);
    engine = workspaceEngineReducer(engine, { type: 'undo' });
    expect(engine.present.lines.refLines[0]?.value).toBe(5);
    engine = workspaceEngineReducer(engine, { type: 'undo' });
    expect(engine.present.lines.refLines[0]?.paneIds).toEqual(['pane-1']);
    engine = workspaceEngineReducer(engine, { type: 'undo' });
    expect(engine.present.lines.refLines).toEqual([]);
  });
});
