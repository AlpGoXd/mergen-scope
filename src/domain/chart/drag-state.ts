import type { ZoomWindow } from '../../types/marker';

export type ZoomDrag = {
  start: number;
  current: number;
  startY?: number;
  currentY?: number;
  startClientY?: number;
  currentClientY?: number;
};
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
  | { type: 'start-zoom'; start: number; startY?: number; startClientY?: number }
  | { type: 'start-pan'; startZoom: ZoomWindow; startClientX: number }
  | { type: 'start-marker'; index: number }
  | { type: 'start-line'; id: number }
  | { type: 'move'; current: number; currentY?: number; currentClientY?: number }
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
    case 'start-zoom': {
      const zoom: ZoomDrag = {
        start: event.start,
        current: event.start,
        ...(event.startY !== undefined ? { startY: event.startY, currentY: event.startY } : {}),
        ...(event.startClientY !== undefined ? { startClientY: event.startClientY, currentClientY: event.startClientY } : {}),
      };
      return startDrag(state, { kind: 'zoom', zoom });
    }
    case 'start-pan':
      return startDrag(state, { kind: 'pan', pan: { startZoom: event.startZoom, startClientX: event.startClientX } });
    case 'start-marker':
      return startDrag(state, { kind: 'marker', marker: event.index });
    case 'start-line':
      return startDrag(state, { kind: 'line', line: event.id });
    case 'move': {
      if (!('zoom' in state) || !state.zoom) return state;
      const nextY = event.currentY !== undefined ? event.currentY : state.zoom.currentY;
      const nextClientY = event.currentClientY !== undefined ? event.currentClientY : state.zoom.currentClientY;
      if (
        Object.is(state.zoom.current, event.current)
        && Object.is(state.zoom.currentY, nextY)
        && Object.is(state.zoom.currentClientY, nextClientY)
      ) return state;
      return {
        ...state,
        zoom: {
          ...state.zoom,
          current: event.current,
          ...(nextY !== undefined ? { currentY: nextY } : {}),
          ...(nextClientY !== undefined ? { currentClientY: nextClientY } : {}),
        },
      };
    }
    case 'release':
      return state.kind === 'idle' ? state : idleDragState;
    case 'cancel':
      return ('marker' in state && state.marker != null)
        || ('line' in state && state.line != null)
        || ('zoom' in state && state.zoom != null)
        ? idleDragState
        : state;
  }
}
