import { describe, expect, it } from 'vitest';
import { initialWorkspaceEngine, workspaceEngineReducer } from '../../src/stores/aggregate-workspace-store';
import type { WorkspaceEngine } from '../../src/stores/aggregate-workspace-store';
import type { AnalysisAction } from '../../src/stores/analysis-store';
import { makeTestTrace } from './helpers';

const a = makeTestTrace({ id: 'a', name: 'a', dn: 'A', data: [{ freq: 0, amp: 2 }, { freq: 1, amp: 4 }] });
const b = makeTestTrace({ id: 'b', name: 'b', dn: 'B', data: [{ freq: 0, amp: 1 }, { freq: 1, amp: 2 }] });
const change = (engine: WorkspaceEngine, action: AnalysisAction) => workspaceEngineReducer(engine, { type: 'change', command: { slice: 'analysis', action } });
const undo = (engine: WorkspaceEngine) => workspaceEngineReducer(engine, { type: 'undo' });
const redo = (engine: WorkspaceEngine) => workspaceEngineReducer(engine, { type: 'redo' });
const add: AnalysisAction = { type: 'ADD_ANALYSIS', payload: { toolId: 'trace-math', source: { traceId: 'a', secondTraceId: 'b' } } };
const create: AnalysisAction = { type: 'CREATE_ANALYSIS_OUTPUT', payload: { id: 'analysis-1' } };
const subtract: AnalysisAction = { type: 'SET_ANALYSIS_PARAMS', payload: { id: 'analysis-1', params: { operation: 'subtract' } } };

function setup(): WorkspaceEngine {
  let engine = workspaceEngineReducer(initialWorkspaceEngine(), { type: 'change', command: { slice: 'files', action: { type: 'ADD_PARSED_FILE', payload: { id: 'f', fileName: 'f.dat', text: '', parsed: { format: 'rs-dat', meta: {}, traces: [a, b] } } } } });
  engine = { ...engine, present: { ...engine.present, files: { ...engine.present.files, files: engine.present.files.files.map(file => ({ ...file, traces: [a, b], datasets: [], displayTraces: [] })) }, panes: { ...engine.present.panes, tracePaneMap: { a: ['pane-1'], b: ['pane-1'] } } } };
  return engine;
}

describe('analysis math lifecycle', () => {
  it('creates a card, then one linked output in the source panes, each undoable', () => {
    let engine = setup(); const before = engine.history.past.length;
    engine = change(engine, add);
    expect(engine.present.traces.derivedTraces).toHaveLength(0);
    expect(engine.present.analysis.analyses[0]?.outputTraceId).toBeNull();
    expect(engine.history.past).toHaveLength(before + 1);
    engine = change(engine, create);
    const output = engine.present.traces.derivedTraces[0]; if (!output) throw new Error('missing output');
    expect(engine.present.traces.derivedTraces).toHaveLength(1);
    expect(output).toMatchObject({ analysisId: 'analysis-1', dn: 'A + B' });
    expect(engine.present.panes.tracePaneMap[output.name]).toEqual(['pane-1']);
    expect(engine.history.past).toHaveLength(before + 2);
    engine = undo(engine); expect(engine.present.traces.derivedTraces).toHaveLength(0);
    engine = undo(engine); expect(engine.present.analysis.analyses).toHaveLength(0);
    engine = redo(redo(engine)); expect(engine.present.traces.derivedTraces[0]?.id).toBe(output.id);
    expect(engine.present.panes.tracePaneMap[output.name]).toEqual(['pane-1']);
  });
  it('updates the same output and preserves a manual rename, with one undo per change', () => {
    let engine = change(change(setup(), add), create);
    const output = engine.present.traces.derivedTraces[0]; if (!output) throw new Error('missing output');
    const before = engine.history.past.length;
    engine = change(engine, subtract);
    expect(engine.history.past).toHaveLength(before + 1);
    expect(engine.present.traces.derivedTraces).toHaveLength(1);
    expect(engine.present.traces.derivedTraces[0]).toMatchObject({ id: output.id, name: output.name, dn: 'A − B', data: [{ freq: 0, amp: 1 }, { freq: 1, amp: 2 }] });
    engine = undo(engine); expect(engine.present.traces.derivedTraces[0]?.dn).toBe('A + B');
    engine = redo(engine); expect(engine.present.traces.derivedTraces[0]?.dn).toBe('A − B');
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'traces', action: { type: 'RENAME_DERIVED', payload: { traceId: output.id, label: 'Manual' } } } });
    engine = change(engine, { type: 'SET_ANALYSIS_PARAMS', payload: { id: 'analysis-1', params: { operation: 'multiply' } } });
    expect(engine.present.traces.derivedTraces[0]?.dn).toBe('Manual');
    engine = undo(engine); expect(engine.present.traces.derivedTraces[0]?.dn).toBe('Manual');
    engine = redo(engine); expect(engine.present.traces.derivedTraces[0]?.dn).toBe('Manual');
  });
  it('freezes a copy and the removed card output independently', () => {
    let engine = change(change(setup(), add), create);
    const output = engine.present.traces.derivedTraces[0]; if (!output) throw new Error('missing output');
    engine = change(engine, { type: 'FREEZE_ANALYSIS_COPY', payload: { id: 'analysis-1' } });
    const copy = engine.present.traces.derivedTraces[1]; if (!copy) throw new Error('missing copy');
    expect(copy).toMatchObject({ dn: 'A + B (copy)', sourceTraceIds: ['a', 'b'] });
    expect(copy.kind === 'derived' && copy.analysisId).toBeUndefined();
    expect(engine.present.panes.tracePaneMap[copy.name]).toEqual(['pane-1']);
    engine = undo(engine); expect(engine.present.traces.derivedTraces).toHaveLength(1);
    engine = redo(engine); engine = change(engine, subtract);
    expect(engine.present.traces.derivedTraces[1]?.data).toEqual(copy.data);
    engine = change(engine, { type: 'REMOVE_ANALYSIS', payload: { id: 'analysis-1' } });
    const frozen = engine.present.traces.derivedTraces.find(t => t.id === output.id);
    expect(frozen?.kind === 'derived' && frozen.analysisId).toBeUndefined();
    engine = undo(engine); expect(engine.present.analysis.analyses[0]?.outputTraceId).toBe(output.id);
    engine = redo(engine); expect(engine.present.analysis.analyses).toHaveLength(0);
    const file = engine.present.files.files[0]; if (!file) throw new Error('missing file');
    const updated = { ...a, data: [{ freq: 0, amp: 20 }, { freq: 1, amp: 40 }] };
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'files', action: { type: 'RESTORE_FILES', payload: { ...engine.present.files, files: [{ ...file, traces: [updated, b] }] } } } });
    expect(engine.present.traces.derivedTraces.find(t => t.id === output.id)?.data).toEqual(frozen?.data);
    expect(engine.present.traces.derivedTraces.find(t => t.id === copy.id)?.data).toEqual(copy.data);
  });
  it('detaches a deleted output and creates another, with undo and redo', () => {
    let engine = change(change(setup(), add), create);
    const output = engine.present.traces.derivedTraces[0]; if (!output) throw new Error('missing output');
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'deleteTrace', traceId: output.id } });
    expect(engine.present.analysis.analyses[0]?.outputTraceId).toBeNull();
    engine = undo(engine); expect(engine.present.analysis.analyses[0]?.outputTraceId).toBe(output.id);
    engine = redo(engine); engine = change(engine, create);
    expect(engine.present.analysis.analyses[0]?.outputTraceId).not.toBe(output.id);
    engine = undo(engine); expect(engine.present.analysis.analyses[0]?.outputTraceId).toBeNull();
    engine = redo(engine); expect(engine.present.traces.derivedTraces).toHaveLength(1);
  });
  it('does not record an attempt with unresolved inputs', () => {
    const engine = change(setup(), { type: 'ADD_ANALYSIS', payload: { toolId: 'trace-math', source: { traceId: 'a', secondTraceId: 'missing' } } });
    expect(change(engine, create)).toBe(engine);
  });
});
