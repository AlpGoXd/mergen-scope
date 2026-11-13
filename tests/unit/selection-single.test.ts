import { describe, expect, it } from 'vitest';
import { initialWorkspaceEngine, workspaceEngineReducer } from '../../src/stores/aggregate-workspace-store';
import type { WorkspaceAction, WorkspaceEngine } from '../../src/stores/aggregate-workspace-store';
import { makeTestTrace } from './helpers';

const trace = makeTestTrace();
const change = (engine: WorkspaceEngine, command: WorkspaceAction) => workspaceEngineReducer(engine, { type: 'change', command });
const marker: WorkspaceAction = { slice: 'markers', action: { type: 'PLACE_MARKER', payload: { trace, targetFreq: 10 } } };
const line: WorkspaceAction = { slice: 'lines', action: { type: 'ADD_LINE', payload: { id: 1, type: 'v', value: 10, paneIds: ['pane-1'], label: 'V1' } } };
const selectTrace: WorkspaceAction = { slice: 'ui', action: { type: 'SET', payload: { key: 'selectedTraceName', value: trace.name } } };

describe('exclusive marker and line selection', () => {
  it('keeps trace, marker and line selections exclusive in either direction', () => {
    let engine = change(change(initialWorkspaceEngine(), marker), line);
    engine = change(engine, selectTrace);
    expect(engine.present.markers.selectedMkrIdx).toBe(-1);
    expect(engine.present.lines.selectedRefLineId).toBeNull();
    engine = change(engine, { slice: 'markers', action: { type: 'SET_SELECTED_IDX', payload: 0 } });
    expect(engine.present.ui.selectedTraceName).toBeNull();
    engine = change(engine, selectTrace);
    expect(engine.present.markers.selectedMkrIdx).toBe(-1);
    engine = change(engine, { slice: 'lines', action: { type: 'SET_SELECTED', payload: 1 } });
    expect(engine.present.ui.selectedTraceName).toBeNull();
    engine = change(engine, selectTrace);
    expect(engine.present.lines.selectedRefLineId).toBeNull();
    engine = change(engine, marker);
    expect(engine.present.ui.selectedTraceName).toBeNull();
  });
  it('clears selection when the selected trace is removed', () => {
    const output = makeTestTrace({ id: 'output', name: 'output', kind: 'derived', operationType: 'derived', sourceTraceIds: [] });
    const base = initialWorkspaceEngine();
    let engine: WorkspaceEngine = { ...base, present: { ...base.present, traces: { ...base.present.traces, derivedTraces: [output], vis: { output: true } } } };
    engine = change(engine, { slice: 'ui', action: { type: 'SET', payload: { key: 'selectedTraceName', value: 'output' } } });
    engine = change(engine, { slice: 'deleteTrace', traceId: 'output' });
    expect(engine.present.ui.selectedTraceName).toBeNull();
    expect(engine.present.markers.selectedMkrIdx).toBe(-1);
    expect(engine.present.lines.selectedRefLineId).toBeNull();
  });
  it('selects each in turn and clears both on escape-like actions', () => {
    let engine = change(change(initialWorkspaceEngine(), marker), line);
    expect(engine.present.markers.selectedMkrIdx).toBe(-1);
    expect(engine.present.lines.selectedRefLineId).toBe(1);
    engine = change(engine, { slice: 'markers', action: { type: 'SET_SELECTED_IDX', payload: 0 } });
    expect(engine.present.lines.selectedRefLineId).toBeNull();
    expect(engine.present.markers.selectedMkrIdx).toBe(0);
    engine = change(engine, { slice: 'lines', action: { type: 'SET_SELECTED', payload: 1 } });
    expect(engine.present.markers.selectedMkrIdx).toBe(-1);
    engine = change(engine, marker);
    expect(engine.present.lines.selectedRefLineId).toBeNull();
    engine = change(engine, { slice: 'markers', action: { type: 'SET_SELECTED_IDX', payload: -1 } });
    engine = change(engine, { slice: 'lines', action: { type: 'SET_SELECTED', payload: null } });
    expect(engine.present.markers.selectedMkrIdx).toBe(-1);
    expect(engine.present.lines.selectedRefLineId).toBeNull();
  });
  it('keeps selection consistent when the selected item is deleted', () => {
    let engine = change(change(initialWorkspaceEngine(), marker), line);
    engine = change(engine, { slice: 'lines', action: { type: 'REMOVE_LINE', payload: 1 } });
    expect(engine.present.lines.selectedRefLineId).toBeNull();
    engine = change(engine, { slice: 'markers', action: { type: 'SET_SELECTED_IDX', payload: 0 } });
    engine = change(engine, { slice: 'markers', action: { type: 'REMOVE_MARKER', payload: 0 } });
    expect(engine.present.markers.selectedMkrIdx).toBe(-1);
    expect(engine.present.lines.selectedRefLineId).toBeNull();
  });
});
