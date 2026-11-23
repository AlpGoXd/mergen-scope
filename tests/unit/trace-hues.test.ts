import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { allocateColourBlindCreated, displayTraceColor, forcesHollowTraceSymbol, traceDisplaySymbol } from '../../src/domain/trace-colors';
import { planDotsAndSymbols } from '../../src/domain/dots-and-symbols';
import { symbolFor, traceColor, traceWidth } from '../../src/domain/trace-palette';
import { initialWorkspaceEngine, workspaceEngineReducer } from '../../src/stores/aggregate-workspace-store';
import { makeTestTrace } from './helpers';
import type { Trace } from '../../src/types/trace';

it('maps source colours without changing slots on a palette switch', () => {
  const traces = Array.from({ length: 4 }, (_, i) => makeTestTrace({ id: String(i), name: String(i) }));
  const child = makeTestTrace({ id: 'child', name: 'child', kind: 'derived', operationType: 'derived', sourceTraceIds: ['1'] } as Partial<Trace>);
  const slots = Object.fromEntries(allocateColourBlindCreated([...traces, child], new Map()));
  const second = slots['1']; if (!second) throw new Error('missing assignment');
  expect(displayTraceColor(second, 'light', 'colour-blind')).toBe('oklch(0.379 0.102 48)');
  const base = initialWorkspaceEngine();
  const engine = { ...base, present: { ...base.present, traces: { ...base.present.traces, derivedTraces: [...traces, child] }, ui: { ...base.present.ui, huePalette: 'standard' as const, traceHueSlots: slots } } };
  const switched = workspaceEngineReducer(engine, { type: 'change', command: { slice: 'ui', action: { type: 'SET', payload: { key: 'huePalette', value: 'colour-blind' } } } });
  expect(switched.present.ui.traceHueSlots).toEqual(slots);
  expect(switched.history).toBe(engine.history);
});

it('assigns Palette A in next-free order, with the parent colour and a forced hollow symbol for created traces', () => {
  const spec = readFileSync(new URL('../../docs/design/colour-values.md', import.meta.url), 'utf8');
  const rows = Array.from(spec.matchAll(/^  \d\. (oklch\([^)]+\)) -> (oklch\([^)]+\))$/gm));
  expect(rows).toHaveLength(16);
  const sources = Array.from({ length: 9 }, (_, index) => makeTestTrace({ id: `source-${index}` }));
  const child = makeTestTrace({ id: 'child', kind: 'derived', operationType: 'derived', sourceTraceIds: ['source-1'] });
  const nested = makeTestTrace({ id: 'nested', kind: 'derived', operationType: 'derived', sourceTraceIds: ['child'] });
  const slots = allocateColourBlindCreated([...sources, child, nested], new Map());
  const childSlot = slots.get('child');
  const nestedSlot = slots.get('nested');
  if (!childSlot || !nestedSlot) throw new Error('Missing created trace assignment');
  expect(childSlot.cbIndex).toBe(1);
  expect(nestedSlot.cbIndex).toBe(1);
  for (const [theme, offset] of [['light', 0], ['dark', 8]] as const) {
    for (const [index, source] of sources.entries()) {
      const slot = slots.get(source.id);
      if (!slot) throw new Error('Missing source trace assignment');
      expect(displayTraceColor(slot, theme, 'colour-blind')).toBe(rows[offset + index % 8]?.[1]);
    }
    expect(displayTraceColor(childSlot, theme, 'colour-blind')).toBe(rows[offset + 1]?.[2]);
    expect(displayTraceColor(nestedSlot, theme, 'colour-blind')).toBe(rows[offset + 1]?.[2]);
  }
  expect(traceWidth(childSlot)).toBe(2);
  expect(displayTraceColor(childSlot, 'light', 'standard')).toBe(traceColor(childSlot, 'light'));
  expect(traceDisplaySymbol(childSlot, 'off', 'colour-blind')).toBe(symbolFor(childSlot, 'always'));
  expect(traceDisplaySymbol(childSlot, 'off', 'standard')).toBeNull();
  const plan = planDotsAndSymbols({ points: [{ x: 0, y: 0 }], showDots: false,
    showSymbols: true, forceHollow: forcesHollowTraceSymbol(child.kind, 'colour-blind') });
  expect(plan.hollow).toBe(true);
  expect(plan.symbols).toHaveLength(1);
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

