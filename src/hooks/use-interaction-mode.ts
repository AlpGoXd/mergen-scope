import { useCallback, useMemo } from 'react';
import { useMarkerState, useMarkerDispatch } from '../stores/marker-store';
import { useRefLineState, useRefLineDispatch } from '../stores/ref-line-store';

/**
 * Hook for managing the interaction mode (Marker placement vs. Ref-line placement).
 * Ported from app-modules/app-hooks.js:useInteractionMode.
 */
export function useInteractionMode() {
  const { markers, mkrMode, dRef } = useMarkerState();
  const markerDispatch = useMarkerDispatch();

  const { refMode } = useRefLineState();
  const refLineDispatch = useRefLineDispatch();

  const selectNormal = useCallback(() => {
    refLineDispatch({ type: 'SET_REF_MODE', payload: null });
    markerDispatch({ type: 'SET_MKR_MODE', payload: 'normal' });
  }, [refLineDispatch, markerDispatch]);

  const selectDelta = useCallback(() => {
    refLineDispatch({ type: 'SET_REF_MODE', payload: null });
    markerDispatch({ type: 'SET_MKR_MODE', payload: 'delta' });
    if (markers.length > 0 && dRef === null) {
      markerDispatch({ type: 'SET_DREF', payload: 0 });
    }
  }, [refLineDispatch, markerDispatch, markers, dRef]);

  const clearRefPlacement = useCallback(() => {
    refLineDispatch({ type: 'SET_REF_MODE', payload: null });
  }, [refLineDispatch]);

  const toggleRefPlacement = useCallback((kind: 'h' | 'v' | null) => {
    refLineDispatch({ type: 'SET_REF_MODE', payload: refMode === kind ? null : kind });
  }, [refLineDispatch, refMode]);

  const action = useMemo(() => {
    if (refMode === 'h') return 'place-hline';
    if (refMode === 'v') return 'place-vline';
    return mkrMode === 'delta' ? 'place-delta-marker' : 'place-marker';
  }, [refMode, mkrMode]);

  const hint = useMemo(() => {
    if (action === 'place-hline') return 'Click to place H-line';
    if (action === 'place-vline') return 'Click to place V-line';
    if (mkrMode === 'delta' && markers.length > 0) {
      return `Delta reference: M${(dRef === null ? 1 : dRef + 1)}`;
    }
    return null;
  }, [action, mkrMode, markers, dRef]);

  return {
    selectNormal,
    selectDelta,
    clearRefPlacement,
    toggleRefPlacement,
    action,
    hint
  };
}
