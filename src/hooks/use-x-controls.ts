import { useCallback } from 'react';
import { usePaneState, usePaneDispatch } from '../stores/pane-store';
import type { ZoomWindow } from '../types/marker';

export function useXControls() {
  const { zoomAll, sharedZoom, paneXZooms, activePaneId, panes } = usePaneState();
  const dispatch = usePaneDispatch();

  const zoom = zoomAll ? sharedZoom : (activePaneId ? (paneXZooms[activePaneId] || null) : null);

  const setZoom = useCallback((
    nextOrUpdater: ZoomWindow | null | ((prev: ZoomWindow | null) => ZoomWindow | null),
    forPaneId?: string
  ) => {
    if (zoomAll) {
      dispatch({ type: 'SET_SHARED_ZOOM', payload: nextOrUpdater });
    } else {
      const paneId = forPaneId || activePaneId || 'pane-1';
      dispatch({ type: 'SET_PANE_ZOOM', payload: { paneId, zoom: nextOrUpdater } });
    }
  }, [zoomAll, activePaneId, dispatch]);

  const getPaneZoom = useCallback((paneId: string) => {
    return zoomAll ? sharedZoom : (paneXZooms[paneId] || null);
  }, [zoomAll, sharedZoom, paneXZooms]);

  const clearAllXZooms = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL_ZOOMS' });
  }, [dispatch]);

  const setZoomAll = useCallback((nextValue: boolean | ((prev: boolean) => boolean)) => {
    const target = typeof nextValue === 'function' ? nextValue(zoomAll) : nextValue;
    if (target === zoomAll) return;

    if (target) {
      // When enabling zoomAll, synchronize all to the current active zoom
      const activeZoom = (activePaneId ? paneXZooms[activePaneId] : null) || sharedZoom || null;
      dispatch({ type: 'SET_SHARED_ZOOM', payload: activeZoom });
    } else {
      // When disabling, push the shared zoom to all individual panes
      const base = sharedZoom;
      panes.forEach(pane => {
        dispatch({ type: 'SET_PANE_ZOOM', payload: { paneId: pane.id, zoom: base } });
      });
    }

    dispatch({ type: 'SET_ZOOM_ALL', payload: target });
  }, [zoomAll, activePaneId, paneXZooms, sharedZoom, panes, dispatch]);

  return {
    zoomAll,
    setZoomAll,
    zoom,
    setZoom,
    sharedZoom,
    paneXZooms,
    getPaneZoom,
    clearAllXZooms
  };
}
