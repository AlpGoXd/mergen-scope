import { expect, it } from 'vitest';
import { computeInstance, createInstance } from '../../src/domain/analysis/instances';
import { makeTestTrace } from './helpers';
import { initialWorkspaceEngine, workspaceEngineReducer } from '../../src/stores/aggregate-workspace-store';
import type { WorkspaceEngine } from '../../src/stores/aggregate-workspace-store';
import type { AnalysisAction } from '../../src/stores/analysis-store';

it('requires alignment choices before computing a new output and keeps legacy outputs', () => {
  const a = makeTestTrace({ id: 'a', data: [{ freq: 0, amp: 1 }, { freq: 2, amp: 3 }] });
  const b = makeTestTrace({ id: 'b', data: [{ freq: 0, amp: 1 }, { freq: 1, amp: 2 }, { freq: 2, amp: 3 }] });
  const instance = createInstance('analysis-1', 'trace-math', { traceId: 'a', secondTraceId: 'b' });
  if (!instance) throw new Error('missing instance');
  expect(computeInstance(instance, { traces: [a, b] }).reason).toBe('Choose Points and Fill gaps.');
  expect(computeInstance({ ...instance, params: { ...instance.params, points: 'a', fill: 'linear' } }, { traces: [a, b] }).outputs).toHaveLength(1);
  expect(computeInstance({ ...instance, params: { operation: 'add' }, outputTraceId: 'derived-1' }, { traces: [a, b] }).outputs).toHaveLength(1);
});

it('creates only after selection and recomputes the same output on a fill change', () => {
  const a = makeTestTrace({ id: 'a', name: 'a', data: [{ freq: 0, amp: 1 }, { freq: 1, amp: 2 }, { freq: 2, amp: 3 }] });
  const b = makeTestTrace({ id: 'b', name: 'b', data: [{ freq: 0, amp: 1 }, { freq: 2, amp: 5 }] });
  const change = (engine: WorkspaceEngine, action: AnalysisAction) => workspaceEngineReducer(engine, { type: 'change', command: { slice: 'analysis', action } });
  let engine = workspaceEngineReducer(initialWorkspaceEngine(), { type: 'change', command: { slice: 'files', action: { type: 'ADD_PARSED_FILE', payload: { id: 'f', fileName: 'f.dat', text: '', parsed: { format: 'rs-dat', meta: {}, traces: [a, b] } } } } });
  engine = { ...engine, present: { ...engine.present, files: { ...engine.present.files, files: engine.present.files.files.map(file => ({ ...file, traces: [a, b], datasets: [], displayTraces: [] })) } } };
  engine = change(engine, { type: 'ADD_ANALYSIS', payload: { toolId: 'trace-math', source: { traceId: 'a', secondTraceId: 'b' } } });
  const create: AnalysisAction = { type: 'CREATE_ANALYSIS_OUTPUT', payload: { id: 'analysis-1' } };
  engine = change(engine, create);
  expect(engine.present.traces.derivedTraces).toHaveLength(0);
  engine = change(engine, { type: 'SET_ANALYSIS_PARAMS', payload: { id: 'analysis-1', params: { points: 'a', fill: 'linear' } } });
  engine = change(engine, create);
  expect(engine.present.traces.derivedTraces).toHaveLength(1);
  const output = engine.present.traces.derivedTraces[0];
  if (!output) throw new Error('missing output');
  engine = change(engine, { type: 'SET_ANALYSIS_PARAMS', payload: { id: 'analysis-1', params: { fill: 'previous' } } });
  expect(engine.present.traces.derivedTraces[0]?.id).toBe(output.id);
  expect(engine.present.traces.derivedTraces[0]?.dn).toBe(output.dn);
  expect(engine.present.traces.derivedTraces[0]?.data).not.toEqual(output.data);
});
