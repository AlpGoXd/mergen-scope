import { expect, it } from 'vitest';
import { initialWorkspaceEngine, workspaceEngineReducer } from '../../src/stores/aggregate-workspace-store';
import type { WorkspaceEngine } from '../../src/stores/aggregate-workspace-store';
import { makeTestTrace } from './helpers';

const trace = makeTestTrace({ id: 'peaks', name: 'peaks', data: [{ freq: 0, amp: 0 }, { freq: 1, amp: 5 }, { freq: 2, amp: 0 }, { freq: 3, amp: 4 }, { freq: 4, amp: 0 }, { freq: 5, amp: 3 }, { freq: 6, amp: 0 }] });
function setup(): WorkspaceEngine {
  let engine = workspaceEngineReducer(initialWorkspaceEngine(), { type: 'change', command: { slice: 'files', action: { type: 'ADD_PARSED_FILE', payload: { id: 'f', fileName: 'f.dat', text: '', parsed: { format: 'rs-dat', meta: {}, traces: [trace] } } } } });
  engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'analysis', action: { type: 'ADD_ANALYSIS', payload: { toolId: 'peak-table', source: { traceId: trace.id } } } } });
  return engine;
}

it('places one marker, then adds missing peaks in one undoable change', () => {
  let engine = setup();
  engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'markers', action: { type: 'PLACE_MARKER', payload: { trace, targetFreq: 1 } } } });
  expect(engine.present.markers.markers).toHaveLength(1);
  expect(engine.present.markers.markers[0]).toMatchObject({ trace: trace.name, freq: 1 });
  const before = engine.history.past.length;
  const action = { type: 'change' as const, toastKind: 'apply-all' as const, toastMessage: 'Added 2 markers', command: { slice: 'markers' as const, action: { type: 'PLACE_MARKERS' as const, payload: { trace, targetFreqs: [1, 3, 5] } } } };
  engine = workspaceEngineReducer(engine, action);
  expect(engine.present.markers.markers.map(marker => marker.freq)).toEqual([1, 3, 5]);
  expect(engine.history.past).toHaveLength(before + 1);
  expect(engine.toastMessage).toBe('Added 2 markers');
  engine = workspaceEngineReducer(engine, { type: 'clear-notice' });
  expect(workspaceEngineReducer(engine, action)).toBe(engine);
  expect(engine.toastMessage).toBeUndefined();
  engine = workspaceEngineReducer(engine, { type: 'undo' });
  expect(engine.present.markers.markers.map(marker => marker.freq)).toEqual([1]);
});

it('keeps peak highlighting out of history and clears it when the card is removed', () => {
  let engine = setup();
  const before = engine.history.past.length;
  engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'analysis', action: { type: 'SET_HIGHLIGHTED_PEAK', payload: { analysisId: 'analysis-1', n: 2 } } } });
  expect(engine.history.past).toHaveLength(before);
  expect(engine.present.analysis.highlightedPeak).toEqual({ analysisId: 'analysis-1', n: 2 });
  engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'analysis', action: { type: 'REMOVE_ANALYSIS', payload: { id: 'analysis-1' } } } });
  expect(engine.present.analysis.highlightedPeak).toBeNull();
});
