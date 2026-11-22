import type { ZoomWindow } from '../../types/marker';

type ZoomDrag = { start: number; current: number };
type PanDrag = { startZoom: ZoomWindow; startClientX: number };

type SingleDrag =
  | { kind: 'zoom'; zoom: ZoomDrag }
  | { kind: 'pan'; pan: PanDrag }
  | { kind: 'marker'; marker: number }
  | { kind: 'line'; line: number };

export type DragState =
  | { kind: 'idle' }
  | SingleDrag
  | { kind: 'overlap'; zoom?: ZoomDrag; pan?: PanDrag; marker?: number; line?: number };

export type DragEvent =
  | { type: 'start-zoom'; start: number }
  | { type: 'start-pan'; startZoom: ZoomWindow; startClientX: number }
  | { type: 'start-marker'; index: number }
  | { type: 'start-line'; id: number }
  | { type: 'move'; current: number }
  | { type: 'release' }
  | { type: 'cancel' };

export const idleDragState: DragState = { kind: 'idle' };

function startDrag(state: DragState, drag: SingleDrag): DragState {
  if (state.kind === 'idle' || state.kind === drag.kind) return drag;
  // A second mouse button can start a drag while the first is held. Keep both until release.
  return { ...state, ...drag, kind: 'overlap' };
}

export function dragReducer(state: DragState, event: DragEvent): DragState {
  switch (event.type) {
    case 'start-zoom':
      return startDrag(state, { kind: 'zoom', zoom: { start: event.start, current: event.start } });
    case 'start-pan':
      return startDrag(state, { kind: 'pan', pan: { startZoom: event.startZoom, startClientX: event.startClientX } });
    case 'start-marker':
      return startDrag(state, { kind: 'marker', marker: event.index });
    case 'start-line':
      return startDrag(state, { kind: 'line', line: event.id });
    case 'move':
      if (!('zoom' in state) || !state.zoom || Object.is(state.zoom.current, event.current)) return state;
      return { ...state, zoom: { ...state.zoom, current: event.current } };
    case 'release':
      return state.kind === 'idle' ? state : idleDragState;
    case 'cancel':
      return ('marker' in state && state.marker != null) || ('line' in state && state.line != null)
        ? idleDragState
        : state;
  }
}
