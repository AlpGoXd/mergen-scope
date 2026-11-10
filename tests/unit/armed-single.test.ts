import { createElement } from 'react';
import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { StoreRoot } from '../../src/stores/StoreRoot';
import { useInteractionMode } from '../../src/hooks/use-interaction-mode';
import { useKeyboard } from '../../src/hooks/use-keyboard';
import { useMarkerDispatch, useMarkerState } from '../../src/stores/marker-store';
import { useRefLineState } from '../../src/stores/ref-line-store';
import { makeTestTrace } from './helpers';

it('arms only one marker or line tool and Escape cancels', () => {
  const { result } = renderHook(() => {
    useKeyboard();
    return { mode: useInteractionMode(), markers: useMarkerState(), lines: useRefLineState(), dispatch: useMarkerDispatch() };
  }, { wrapper: ({ children }) => createElement(StoreRoot, { children }) });
  act(() => result.current.mode.toggleRefPlacement('v'));
  act(() => result.current.mode.selectNormal());
  expect(result.current.lines.refMode).toBeNull();
  expect(result.current.markers.armed?.kind).toBe('normal');
  act(() => result.current.mode.toggleRefPlacement('h'));
  expect(result.current.markers.armed).toBeNull();
  expect(result.current.lines.refMode).toBe('h');
  act(() => result.current.dispatch({ type: 'PLACE_MARKER', payload: { trace: makeTestTrace(), targetFreq: 10 } }));
  act(() => result.current.mode.selectDelta());
  expect(result.current.lines.refMode).toBeNull();
  expect(result.current.markers.armed?.kind).toBe('delta');
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(result.current.markers.armed).toBeNull();
  expect(result.current.lines.refMode).toBeNull();
});
