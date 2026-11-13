import { useCallback } from 'react';
import { usePaneState, usePaneDispatch } from '../stores/pane-store';
import type { ZoomWindow } from '../types/marker';

/** X zoom of the target pane. A zoom set on a pane also applies to the rest of its X link group (pane store). */
export function useXControls() {
  const { paneXZooms, activePaneId } = usePaneState();
  const dispatch = usePaneDispatch();

  const zoom = activePaneId ? (paneXZooms[activePaneId] || null) : null;

  const setZoom = useCallback((
    nextOrUpdater: ZoomWindow | null | ((prev: ZoomWindow | null) => ZoomWindow | null),
    forPaneId?: string
  ) => {
    const paneId = forPaneId || activePaneId || 'pane-1';
    dispatch({ type: 'SET_PANE_ZOOM', payload: { paneId, zoom: nextOrUpdater } });
  }, [activePaneId, dispatch]);

  const getPaneZoom = useCallback((paneId: string) => paneXZooms[paneId] || null, [paneXZooms]);

  const clearAllXZooms = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL_ZOOMS' });
  }, [dispatch]);

  return { zoom, setZoom, paneXZooms, getPaneZoom, clearAllXZooms };
}
