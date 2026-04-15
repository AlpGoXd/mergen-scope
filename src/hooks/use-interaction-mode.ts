import { useCallback, useMemo } from 'react';
import { useMarkerState, useMarkerDispatch } from '../stores/marker-store';
import { useRefLineState, useRefLineDispatch } from '../stores/ref-line-store';
import { useUiDispatch } from '../stores/ui-store';

/**
 * Hook for managing the interaction mode (Marker placement vs. Ref-line placement).
 * Ported from app-modules/app-hooks.js:useInteractionMode.
 */
export function useInteractionMode() {
  const { markers, mkrMode, selectedMkrIdx } = useMarkerState();
  const markerDispatch = useMarkerDispatch();

  const { refMode } = useRefLineState();
  const refLineDispatch = useRefLineDispatch();
  const uiDispatch = useUiDispatch();

  const selectNormal = useCallback(() => {
    refLineDispatch({ type: 'SET_MODE', payload: null });
    markerDispatch({ type: 'SET_MODE', payload: 'normal' });
    uiDispatch({ type: 'SET', payload: { key: 'dRef', value: null } });
    // Convert selected marker to normal if one is selected
    if (selectedMkrIdx >= 0) {
      markerDispatch({ type: 'UPDATE_MARKER', payload: { idx: selectedMkrIdx, updates: { type: 'normal', refIdx: null } } });
    }
  }, [refLineDispatch, markerDispatch, uiDispatch, selectedMkrIdx]);

  const selectDelta = useCallback(() => {
    refLineDispatch({ type: 'SET_MODE', payload: null });
    markerDispatch({ type: 'SET_MODE', payload: 'delta' });
    // Convert selected marker to delta — auto-pick first valid ref, or null if none
    if (selectedMkrIdx >= 0) {
      const autoRef = markers.findIndex((m, i) => i !== selectedMkrIdx && m.type !== 'delta');
      const refIdx = autoRef >= 0 ? autoRef : null;
      markerDispatch({ type: 'UPDATE_MARKER', payload: { idx: selectedMkrIdx, updates: { type: 'delta', refIdx } } });
      if (refIdx !== null) {
        uiDispatch({ type: 'SET', payload: { key: 'dRef', value: refIdx } });
      }
    }
  }, [refLineDispatch, markerDispatch, uiDispatch, selectedMkrIdx, markers]);

  const clearRefPlacement = useCallback(() => {
    refLineDispatch({ type: 'SET_MODE', payload: null });
  }, [refLineDispatch]);

  const toggleRefPlacement = useCallback((kind: 'h' | 'v' | null) => {
    refLineDispatch({ type: 'SET_MODE', payload: refMode === kind ? null : kind });
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
      return 'Delta mode active';
    }
    return null;
  }, [action, mkrMode, markers]);

  return {
    selectNormal,
    selectDelta,
    clearRefPlacement,
    toggleRefPlacement,
    action,
    hint
  };
}
