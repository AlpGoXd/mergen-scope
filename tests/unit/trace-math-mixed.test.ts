import { describe, expect, it } from 'vitest';
import { computeBinaryTraceMathData } from '../../src/domain/trace-ops';
import type { BinaryOp } from '../../src/domain/trace-ops';
import { traceMathTool } from '../../src/domain/analysis/tools/trace-math';
import { computeInstance, createInstance } from '../../src/domain/analysis/instances';
import { initialWorkspaceEngine, workspaceEngineReducer } from '../../src/stores/aggregate-workspace-store';
import { makeTestTrace } from './helpers';

const fine = makeTestTrace({ id: 'a', units: { x: 'Hz', y: 'dBm' }, data: Array.from({ length: 1001 }, (_, i) => ({ freq: 1.42e9 + i * 1000, amp: 4 })) });
const coarse = makeTestTrace({ id: 'b', family: 'network', units: { x: 'Hz', y: 'dB' }, data: Array.from({ length: 201 }, (_, i) => ({ freq: 1e4 + i * (8.5e9 - 1e4) / 200, amp: 2 })) });
const instance = createInstance('analysis-1', 'trace-math', { traceId: 'a', secondTraceId: 'b' });

describe('mixed trace math', () => {
  for (const operation of ['add', 'subtract', 'multiply', 'divide'] as BinaryOp[]) {
    it(`${operation} interpolates in both source orders`, () => {
      for (const [a, b] of [[fine, coarse], [coarse, fine]] as const) {
        const result = computeBinaryTraceMathData(a.data, b.data, 'linear', operation);
        expect(result.data).toHaveLength(1001);
        expect(result.data?.[0]?.amp).toBe(operation === 'add' ? 6 : operation === 'multiply' ? 8 : operation === 'subtract' ? (a.id === 'a' ? 2 : -2) : (a.id === 'a' ? 2 : 0.5));
      }
    });
  }
  it('reports disjoint ranges and time/frequency mismatch', () => {
    if (!instance) throw new Error('missing instance');
    const disjoint = { ...coarse, data: [{ freq: 1, amp: 2 }, { freq: 2, amp: 2 }] };
    expect(computeInstance(instance, { traces: [fine, disjoint] }).reason).toBe('The traces do not overlap in X, nothing to combine.');
    expect(computeInstance(instance, { traces: [fine, { ...coarse, domain: 'time' }] }).reason).toBe('Cannot combine a time trace (s) with a frequency trace (Hz).');
    expect(computeBinaryTraceMathData(fine.data, coarse.data, 'exact', 'add').error).toBe('Exact only requires matching X samples over the overlap range.');
    const divide = { ...instance, params: { operation: 'divide', points: 'a', fill: 'linear' } };
    const zero = { ...coarse, data: coarse.data.map(point => ({ ...point, amp: 0 })) };
    expect(computeInstance(divide, { traces: [fine, zero] }).reason).toBe('No valid points to combine.');
  });
  it('creates a trace through the tool and aggregate engine', () => {
    expect(traceMathTool.compute({ traces: [fine, coarse] }, { operation: 'add', points: 'a', fill: 'linear' })).toHaveLength(1);
    let engine = workspaceEngineReducer(initialWorkspaceEngine(), { type: 'change', command: { slice: 'files', action: { type: 'ADD_PARSED_FILE', payload: { id: 'f', fileName: 'f.dat', text: '', parsed: { format: 'rs-dat', meta: {}, traces: [fine, coarse] } } } } });
    engine = { ...engine, present: { ...engine.present, files: { ...engine.present.files, files: engine.present.files.files.map(file => ({ ...file, traces: [fine, coarse], datasets: [], displayTraces: [] })) } } };
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'analysis', action: { type: 'ADD_ANALYSIS', payload: { toolId: 'trace-math', source: { traceId: 'a', secondTraceId: 'b' }, params: { points: 'a', fill: 'linear' } } } } });
    engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'analysis', action: { type: 'CREATE_ANALYSIS_OUTPUT', payload: { id: 'analysis-1' } } } });
    expect(engine.present.traces.derivedTraces).toHaveLength(1);
  });
});
