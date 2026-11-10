import { expect, it } from 'vitest';
import { allocateColourBlindCreated, displayTraceColor } from '../../src/domain/trace-colors';
import { traceColor, traceWidth } from '../../src/domain/trace-palette';
import { initialWorkspaceEngine, workspaceEngineReducer } from '../../src/stores/aggregate-workspace-store';
import { makeTestTrace } from './helpers';
import type { Trace } from '../../src/types/trace';

it('maps source colours without changing slots on a palette switch', () => {
  const traces = Array.from({ length: 4 }, (_, i) => makeTestTrace({ id: String(i), name: String(i) }));
  const child = makeTestTrace({ id: 'child', name: 'child', kind: 'derived', operationType: 'derived', sourceTraceIds: ['1'] } as Partial<Trace>);
  const slots = Object.fromEntries(allocateColourBlindCreated([...traces, child], new Map()));
  const second = slots['1']; if (!second) throw new Error('missing assignment');
  expect(displayTraceColor(second, 'light', 'colour-blind')).toContain(' 135)');
  const base = initialWorkspaceEngine();
  const engine = { ...base, present: { ...base.present, traces: { ...base.present.traces, derivedTraces: [...traces, child] }, ui: { ...base.present.ui, huePalette: 'standard' as const, traceHueSlots: slots } } };
  const switched = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'ui', action: { type: 'SET', payload: { key: 'huePalette', value: 'colour-blind' } } } });
  expect(switched.present.ui.traceHueSlots).toEqual(slots);
  expect(switched.history).toBe(engine.history);
});

it('allocates colour-blind children around parents and keeps surviving choices', () => {
  const source = makeTestTrace({ id: 'source' });
  const child = (id: string, parent = 'source') => makeTestTrace({ id, kind: 'derived', operationType: 'derived', sourceTraceIds: [parent] } as Partial<Trace>);
  const a = child('a'), b = child('b'), c = child('c');
  const initial = allocateColourBlindCreated([source, a, b, c], new Map());
  expect([initial.get('a')?.cbIndex, initial.get('b')?.cbIndex, initial.get('c')?.cbIndex]).toEqual([1, 7, 2]);
  const chain = allocateColourBlindCreated([source, a, child('nested', 'a')], initial);
  expect(chain.get('nested')?.cbIndex).toBe(2);
  const next = allocateColourBlindCreated([source, b, c, child('new')], initial);
  expect(next.get('b')?.cbIndex).toBe(7); expect(next.get('c')?.cbIndex).toBe(2); expect(next.get('new')?.cbIndex).toBe(1);
  const slot = initial.get('a'); if (!slot) throw new Error('missing slot');
  expect(displayTraceColor(slot, 'light', 'colour-blind')).toMatch(/^oklch\(0\.46 /);
  expect(displayTraceColor(slot, 'dark', 'colour-blind')).toMatch(/^oklch\(0\.84 /);
  expect(traceWidth(slot)).toBe(2);
  expect(displayTraceColor(slot, 'light', 'standard')).toBe(traceColor(slot, 'light'));
  const many = Array.from({ length: 9 }, (_, index) => child(`repeat-${index}`));
  const repeated = allocateColourBlindCreated([source, ...many], new Map());
  expect(new Set(many.slice(0, 8).map(trace => repeated.get(trace.id)?.cbIndex)).size).toBe(8);
  expect(repeated.get('repeat-8')?.cbIndex).toBe(1);
});

it('keeps surviving assignments when a file is removed through the engine', () => {
  const add = (id: string) => ({ type: 'change' as const, command: { slice: 'files' as const, action: { type: 'ADD_PARSED_FILE' as const, payload: { id, fileName: `${id}.dat`, text: '', parsed: { format: 'rs-dat' as const, meta: {}, traces: [makeTestTrace({ id, name: id })] } } } } });
  let engine = workspaceEngineReducer(initialWorkspaceEngine(), add('first'));
  engine = workspaceEngineReducer(engine, add('second'));
  const previous = engine.present.ui.traceHueSlots['second'];
  expect(previous).toBeDefined();
  engine = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'files', action: { type: 'REMOVE_FILE', payload: { fileId: 'first' } } } });
  expect(engine.present.ui.traceHueSlots['second']).toEqual(previous);
  expect(engine.present.ui.traceHueSlots['first']).toBeUndefined();
});

