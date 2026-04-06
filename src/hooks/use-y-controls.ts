import { useState, useCallback, useEffect, useRef } from 'react';
import { usePaneState, usePaneDispatch } from '../stores/pane-store';
import type { YDomain } from '../types/pane';

/**
 * Hook for managing Y-axis scaling and manual input controls.
 * Ported from app-modules/app-hooks.js:useYControls.
 */
export function useYControls() {
  const { paneYZooms, activePaneId } = usePaneState();
  const dispatch = usePaneDispatch();

  const [yMnI, setYMnI] = useState('');
  const [yMxI, setYMxI] = useState('');
  const suppressInputCommitRef = useRef(false);

  const paneId = activePaneId || 'pane-1';
  const yZoom = paneYZooms[paneId] || null;

  const setYZoom = useCallback((next: YDomain | null, forPaneId?: string) => {
    const target = forPaneId || activePaneId || 'pane-1';
    dispatch({ type: 'SET_PANE_Y_ZOOM', payload: { paneId: target, zoom: next } });
  }, [activePaneId, dispatch]);

  const getPaneYZoom = useCallback((forPaneId: string) => {
    return paneYZooms[forPaneId] || null;
  }, [paneYZooms]);

  const applyYZ = useCallback(() => {
    const mn = parseFloat(yMnI);
    const mx = parseFloat(yMxI);
    if (isFinite(mn) && isFinite(mx) && mx > mn) {
      setYZoom({ min: mn, max: mx });
    }
  }, [yMnI, yMxI, setYZoom]);

  // Sync inputs when manual text changes (if valid)
  useEffect(() => {
    if (suppressInputCommitRef.current) {
      suppressInputCommitRef.current = false;
      return;
    }
    const mn = parseFloat(yMnI);
    const mx = parseFloat(yMxI);
    if (isFinite(mn) && isFinite(mx) && mn < mx) {
      setYZoom({ min: mn, max: mx });
    }
  }, [yMnI, yMxI, setYZoom]);

  const resetYZ = useCallback((forPaneId?: string) => {
    const target = (typeof forPaneId === 'string') ? forPaneId : paneId;
    setYZoom(null, target);
    if (target === paneId) {
      setYMnI('');
      setYMxI('');
    }
  }, [setYZoom, paneId]);

  const syncYInputsForPane = useCallback((next: YDomain | null, forPaneId?: string) => {
    if (!next || !isFinite(next.min) || !isFinite(next.max)) return;
    setYZoom(next, forPaneId);
    if (!forPaneId || forPaneId === paneId) {
      suppressInputCommitRef.current = true;
      setYMnI(next.min.toFixed(3));
      setYMxI(next.max.toFixed(3));
    }
  }, [setYZoom, paneId]);

  const clearAllPaneYZooms = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL_ZOOMS' });
    setYMnI('');
    setYMxI('');
  }, [dispatch]);

  // Sync inputs with state when active pane or zoom level changes externally
  useEffect(() => {
    if (yZoom && isFinite(yZoom.min) && isFinite(yZoom.max)) {
      suppressInputCommitRef.current = true;
      setYMnI(yZoom.min.toFixed(3));
      setYMxI(yZoom.max.toFixed(3));
    } else {
      suppressInputCommitRef.current = true;
      setYMnI('');
      setYMxI('');
    }
  }, [paneId, yZoom]);

  return {
    yZoom,
    setYZoom,
    getPaneYZoom,
    paneYZooms,
    clearAllPaneYZooms,
    yMnI,
    setYMnI,
    yMxI,
    setYMxI,
    applyYZ,
    resetYZ,
    syncYInputsForPane
  };
}
