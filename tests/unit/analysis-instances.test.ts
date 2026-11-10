import { describe, expect, it } from 'vitest';
import { createInstance, updateParams, moveInstance, computeInstance, recomputeLiveOutputs } from '../../src/domain/analysis/instances';
import { analysisReducer, defaultAnalysisState } from '../../src/stores/analysis-store';
import { initialWorkspaceEngine, workspaceEngineReducer, snapshotFromWorkspace } from '../../src/stores/aggregate-workspace-store';
import { migrateWorkspaceV5 } from '../../src/domain/workspace-migrate-v5';
import type { WorkspaceEngine } from '../../src/stores/aggregate-workspace-store';
import { makeTestTrace } from './helpers';

const source = makeTestTrace({ id: 'source', name: 'source', data: [{ freq: 0, amp: 1 }, { freq: 1, amp: 3 }] });
const add = { type: 'ADD_ANALYSIS' as const, payload: { toolId: 'offset-scale', source: { traceId: 'source' }, params: { offset: 2 } } };

function withSource(): WorkspaceEngine {
  let engine = initialWorkspaceEngine();
  engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'files', action: { type: 'ADD_PARSED_FILE', payload: { id: 'f', fileName: 'f.dat', text: '', parsed: { format: 'rs-dat', meta: {}, traces: [source] } } } } });
  // Use the raw trace representation so this fixture can replace its sample array directly.
  return { ...engine, present: { ...engine.present, files: { ...engine.present.files, files: engine.present.files.files.map(file => ({ ...file, traces: [source], datasets: [], displayTraces: [] })) } } };
}

describe('analysis instances', () => {
  it('validates parameters and supports reducer actions', () => {
    let state = analysisReducer(defaultAnalysisState, add);
    const first = state.analyses[0]; if (!first) throw new Error('missing instance');
    expect(first.params).toEqual({ offset: 2, scale: 1 });
    expect(updateParams(first, { scale: 'bad' })).toBe(first);
    expect(computeInstance(first, { traces: [source] }).outputs?.[0]).toMatchObject({ type: 'trace' });
    state = analysisReducer(state, { type: 'SET_ANALYSIS_PARAMS', payload: { id: first.id, params: { scale: 3 } } });
    state = analysisReducer(state, { type: 'SET_ANALYSIS_COLLAPSED', payload: { id: first.id, collapsed: true } });
    state = analysisReducer(state, { type: 'SET_ANALYSIS_LIVE', payload: { id: first.id, live: false } });
    expect(state.analyses[0]).toMatchObject({ params: { offset: 2, scale: 3 }, collapsed: true, live: false });
    state = analysisReducer(state, { type: 'ADD_ANALYSIS', payload: { toolId: 'ripple', source: { traceId: 'source' } } });
    state = analysisReducer(state, { type: 'MOVE_ANALYSIS', payload: { id: first.id, index: 1 } });
    expect(state.analyses[1]?.id).toBe(first.id);
    expect(moveInstance(state.analyses, 'missing', 0)).toEqual(state.analyses);
    state = analysisReducer(state, { type: 'REMOVE_ANALYSIS', payload: { id: first.id } });
    expect(state.analyses).toHaveLength(1);
    expect(createInstance('x', 'unknown', { traceId: null })).toBeNull();
  });

  it('recomputes only live samples, preserves output metadata, and freezes missing sources', () => {
    const instance = createInstance('analysis-1', 'offset-scale', { traceId: 'source' }, { offset: 2 });
    if (!instance) throw new Error('missing instance');
    const live = { ...instance, outputTraceId: 'out' };
    const output = { ...source, kind: 'derived' as const, id: 'out', name: 'custom', dn: 'Custom label', paneId: 'pane-2', operationType: 'offset' as const, analysisId: live.id, sourceTraceIds: ['source'], parameters: { offset: 2 }, data: [{ freq: 0, amp: 3 }, { freq: 1, amp: 5 }] };
    const changed = { ...source, data: [{ freq: 0, amp: 5 }, { freq: 1, amp: 7 }] };
    const result = recomputeLiveOutputs({ analyses: [live], traces: [changed], derivedTraces: [output] });
    expect(result.derivedTraces[0]).toMatchObject({ id: 'out', name: 'custom', dn: 'Custom label', paneId: 'pane-2', data: [{ freq: 0, amp: 7 }, { freq: 1, amp: 9 }] });
    const frozen = recomputeLiveOutputs({ analyses: [{ ...live, live: false }], traces: [changed], derivedTraces: [output] });
    expect(frozen.derivedTraces[0]).toBe(output);
    const missing = recomputeLiveOutputs({ analyses: [live], traces: [], derivedTraces: [output] });
    expect(missing.analyses[0]?.live).toBe(false);
    expect(missing.derivedTraces[0]).toBe(output);
  });

  it('adds a card and its own output in one history step, with monotonic IDs through undo', () => {
    let engine = withSource();
    const before = engine.history.past.length;
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'analysis', action: add } });
    const instance = engine.present.analysis.analyses[0];
    const output = engine.present.traces.derivedTraces[0];
    expect(instance?.id).toBe('analysis-1');
    expect(output).toMatchObject({ kind: 'derived', analysisId: 'analysis-1', sourceTraceIds: ['source'], operationType: 'offset' });
    expect(output?.id).not.toBe(source.id); expect(output?.name).not.toBe(source.name);
    expect(instance?.outputTraceId).toBe(output?.id);
    expect(engine.history.past).toHaveLength(before + 1);
    engine = workspaceEngineReducer(engine, { type: 'undo' });
    expect(engine.present.analysis.analyses).toHaveLength(0); expect(engine.present.traces.derivedTraces).toHaveLength(0);
    engine = workspaceEngineReducer(engine, { type: 'redo' });
    expect(engine.present.analysis.analyses[0]?.id).toBe('analysis-1'); expect(engine.present.traces.derivedTraces[0]?.id).toBe(output?.id);
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'analysis', action: { type: 'REMOVE_ANALYSIS', payload: { id: 'analysis-1' } } } });
    expect(engine.present.traces.derivedTraces[0]?.id).toBe(output?.id);
    engine = workspaceEngineReducer(engine, { type: 'undo' });
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'analysis', action: add } });
    expect(engine.present.analysis.analyses.map(item => item.id)).toEqual(['analysis-1', 'analysis-2']);
  });

  it('reconciles changed and missing sources in the triggering history step', () => {
    let engine = withSource();
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'analysis', action: add } });
    const file = engine.present.files.files[0]; if (!file) throw new Error('missing file');
    const changed = { ...source, data: [{ freq: 0, amp: 10 }, { freq: 1, amp: 20 }] };
    const before = engine.history.past.length;
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'files', action: { type: 'RESTORE_FILES', payload: { ...engine.present.files, files: [{ ...file, traces: [changed] }] } } } });
    expect(engine.history.past).toHaveLength(before + 1);
    expect(engine.present.traces.derivedTraces[0]?.data.map(point => point.amp)).toEqual([12, 22]);
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'analysis', action: { type: 'SET_ANALYSIS_LIVE', payload: { id: 'analysis-1', live: false } } } });
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'analysis', action: { type: 'SET_ANALYSIS_PARAMS', payload: { id: 'analysis-1', params: { offset: 9 } } } } });
    expect(engine.present.traces.derivedTraces[0]?.data.map(point => point.amp)).toEqual([12, 22]);
    engine = workspaceEngineReducer(engine, { type: 'undo' });
    engine = workspaceEngineReducer(engine, { type: 'undo' });
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'files', action: { type: 'REMOVE_FILE', payload: { fileId: 'f' } } } });
    expect(engine.present.analysis.analyses[0]?.live).toBe(false);
    expect(engine.present.traces.derivedTraces[0]?.data.map(point => point.amp)).toEqual([12, 22]);
    engine = workspaceEngineReducer(engine, { type: 'undo' });
    expect(engine.present.analysis.analyses[0]?.live).toBe(true);
  });
  it('refuses math without sources without recording history', () => {
    const engine = initialWorkspaceEngine();
    expect(workspaceEngineReducer(engine, { type: 'change', command: { slice: 'analysis', action: add } })).toBe(engine);
  });

  it('detaches a deleted output and saves the frozen instance', () => {
    let engine = withSource();
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'analysis', action: add } });
    const id = engine.present.analysis.analyses[0]?.outputTraceId; if (!id) throw new Error('missing output');
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'traces', action: { type: 'REMOVE_DERIVED', payload: id } } });
    expect(engine.present.analysis.analyses[0]).toMatchObject({ live: false, outputTraceId: null });
    const snapshot = snapshotFromWorkspace(engine.present);
    expect(snapshot && migrateWorkspaceV5(JSON.parse(JSON.stringify(snapshot)))).not.toBeNull();
  });

  it('does not recompute when collapsing or moving cards', () => {
    let engine = withSource();
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'analysis', action: add } });
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'analysis', action: { type: 'ADD_ANALYSIS', payload: { toolId: 'ripple', source: { traceId: 'source' } } } } });
    const output = engine.present.traces.derivedTraces[0]; if (!output) throw new Error('missing output');
    const stale = { ...output, data: [] };
    engine = { ...engine, present: { ...engine.present, traces: { ...engine.present.traces, derivedTraces: [stale] } } };
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'analysis', action: { type: 'SET_ANALYSIS_COLLAPSED', payload: { id: 'analysis-1', collapsed: true } } } });
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'analysis', action: { type: 'MOVE_ANALYSIS', payload: { id: 'analysis-1', index: 1 } } } });
    expect(engine.present.traces.derivedTraces[0]).toBe(stale);
  });

  it('refreshes operation metadata and preserves instances on partial restore', () => {
    const instance = createInstance('analysis-1', 'trace-math', { traceId: 'source', secondTraceId: 'other' }, { operation: 'subtract' });
    if (!instance) throw new Error('missing instance');
    const other = { ...source, id: 'other' };
    const output = { ...source, kind: 'derived' as const, id: 'out', operationType: 'add' as const, analysisId: instance.id };
    const result = recomputeLiveOutputs({ analyses: [{ ...instance, outputTraceId: 'out' }], traces: [source, other], derivedTraces: [output] });
    expect(result.derivedTraces[0]?.operationType).toBe('subtract');
    const state = analysisReducer(defaultAnalysisState, add);
    const restored = analysisReducer(state, { type: 'RESTORE', payload: {} });
    expect(restored.analyses).toBe(state.analyses);
    expect(restored.nextAnalysisSerial).toBe(state.nextAnalysisSerial);
  });

});
