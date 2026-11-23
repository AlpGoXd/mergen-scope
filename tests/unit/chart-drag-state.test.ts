import { describe, expect, it } from 'vitest';
import { dragReducer, idleDragState } from '../../src/domain/chart/drag-state';
import type { DragEvent, DragState } from '../../src/domain/chart/drag-state';

const starts = [
  { event: { type: 'start-zoom', start: 0 }, state: { kind: 'zoom', zoom: { start: 0, current: 0 } } },
  {
    event: { type: 'start-pan', startZoom: { left: 10, right: 30 }, startClientX: 0 },
    state: { kind: 'pan', pan: { startZoom: { left: 10, right: 30 }, startClientX: 0 } },
  },
  { event: { type: 'start-marker', index: 0 }, state: { kind: 'marker', marker: 0 } },
  { event: { type: 'start-line', id: 1 }, state: { kind: 'line', line: 1 } },
] as const satisfies readonly { event: DragEvent; state: DragState }[];

describe('chart drag state', () => {
  it.each(starts)('starts a $state.kind drag from idle', ({ event, state }) => {
    expect(dragReducer(idleDragState, event)).toEqual(state);
  });

  it.each(starts)('releases a $state.kind drag', ({ state }) => {
    expect(dragReducer(state, { type: 'release' })).toBe(idleDragState);
  });

  it.each([{ type: 'move', current: 10 }, { type: 'release' }, { type: 'cancel' }] as const)(
    'ignores $type while idle', event => {
      const idle: DragState = { kind: 'idle' };
      expect(dragReducer(idle, event)).toBe(idle);
    },
  );

  it('moves the zoom endpoint, preserving the start and ignoring a repeated position', () => {
    const zoom = starts[0].state;
    const moved = dragReducer(zoom, { type: 'move', current: 20 });
    expect(moved).toEqual({ kind: 'zoom', zoom: { start: 0, current: 20 } });
    expect(zoom.zoom.current).toBe(0);
    expect(dragReducer(moved, { type: 'move', current: 20 })).toBe(moved);
  });

  it.each([starts[1], starts[2], starts[3]])('leaves $state.kind drag data unchanged on move', ({ state }) => {
    expect(dragReducer(state, { type: 'move', current: 20 })).toBe(state);
  });

  it.each([starts[0], starts[1]])('ignores cancel during a $state.kind drag', ({ state }) => {
    expect(dragReducer(state, { type: 'cancel' })).toBe(state);
  });

  it.each([starts[2], starts[3]])('cancels a $state.kind drag', ({ state }) => {
    expect(dragReducer(state, { type: 'cancel' })).toBe(idleDragState);
  });

  it.each([
    { state: { kind: 'zoom', zoom: { start: 0, current: 20 } }, event: { type: 'start-zoom', start: 5 },
      expected: { kind: 'zoom', zoom: { start: 5, current: 5 } } },
    { state: starts[1].state, event: { type: 'start-pan', startZoom: { left: 20, right: 40 }, startClientX: 50 },
      expected: { kind: 'pan', pan: { startZoom: { left: 20, right: 40 }, startClientX: 50 } } },
    { state: starts[2].state, event: { type: 'start-marker', index: 2 }, expected: { kind: 'marker', marker: 2 } },
    { state: starts[3].state, event: { type: 'start-line', id: 2 }, expected: { kind: 'line', line: 2 } },
  ] as const satisfies readonly { state: DragState; event: DragEvent; expected: DragState }[])(
    'updates the starting data when a $state.kind drag is started again', ({ state, event, expected }) => {
      expect(dragReducer(state, event)).toEqual(expected);
    },
  );

  it.each([
    { first: starts[0], second: starts[1], expected: { zoom: starts[0].state.zoom, pan: starts[1].state.pan } },
    { first: starts[2], second: starts[0], expected: { marker: 0, zoom: { start: 0, current: 0 } } },
    { first: starts[3], second: starts[0], expected: { line: 1, zoom: starts[0].state.zoom } },
    { first: starts[2], second: starts[1], expected: { marker: 0, pan: starts[1].state.pan } },
    { first: starts[3], second: starts[1], expected: { line: 1, pan: starts[1].state.pan } },
    { first: starts[2], second: starts[3], expected: { marker: 0, line: 1 } },
  ])('retains $first.state.kind and $second.state.kind data during overlapping presses', ({ first, second, expected }) => {
    const overlap = { kind: 'overlap', ...expected };
    expect(dragReducer(first.state, second.event)).toEqual(overlap);
    expect(dragReducer(second.state, first.event)).toEqual(overlap);
  });

  it('updates the zoom endpoint and keeps the other drag data until release', () => {
    const overlap = dragReducer(starts[2].state, starts[0].event);
    const moved = dragReducer(overlap, { type: 'move', current: 30 });
    expect(moved).toEqual({ kind: 'overlap', marker: 0, zoom: { start: 0, current: 30 } });
    expect(dragReducer(moved, { type: 'move', current: 30 })).toBe(moved);
    expect(dragReducer(moved, starts[0].event)).toEqual(overlap);
    expect(dragReducer(moved, { type: 'release' })).toBe(idleDragState);
  });

  it('ignores a move during overlapping pan and line drags and clears both on cancel', () => {
    const overlap = dragReducer(starts[1].state, starts[3].event);
    expect(dragReducer(overlap, { type: 'move', current: 30 })).toBe(overlap);
    expect(dragReducer(overlap, { type: 'cancel' })).toBe(idleDragState);
  });

  it('ignores cancel while overlapping drags only affect the X domain', () => {
    const overlap = dragReducer(starts[0].state, starts[1].event);
    expect(dragReducer(overlap, { type: 'cancel' })).toBe(overlap);
  });
});
