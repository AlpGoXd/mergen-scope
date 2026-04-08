import { useCallback, useState } from 'react';
import { useUiState, useUiDispatch } from '../stores/ui-store';
import { useAnalysisState, useAnalysisDispatch } from '../stores/analysis-store';
import { useMarkerDispatch } from '../stores/marker-store';
import { 
  getIP3PointsFromMarkers, 
  calcIP3FromPoints, 
  cloneMarkerWithoutIP3Label,
  makeSavedIP3Result,
  type IP3Result
} from '../domain/analysis/ip3';
import type { IP3Points, Marker } from '../types/marker';
import type { Trace } from '../types/trace';

/**
 * Hook for managing IP3 / TOI analysis state.
 * Ported from app-hooks.js.
 */
export function useIP3() {
  const { ip3Gain } = useUiState();
  const { ip3Results } = useAnalysisState();
  const [ip3Pts, setIP3Pts] = useState<IP3Points>({ f1: null, f2: null, im3l: null, im3u: null });
  const [ip3Res, setIP3Res] = useState<IP3Result | null>(null);

  const uiDispatch = useUiDispatch();
  const analysisDispatch = useAnalysisDispatch();
  const markerDispatch = useMarkerDispatch();

  const setIP3Gain = useCallback((gain: string) => {
    uiDispatch({ type: 'SET', payload: { key: 'ip3Gain', value: gain } });
  }, [uiDispatch]);

  const stripIP3Markers = useCallback((markers: readonly Marker[]) => {
    return markers.map(m => cloneMarkerWithoutIP3Label(m));
  }, []);

  const resetIP3 = useCallback((shouldClearMarkers = false) => {
    setIP3Pts({ f1: null, f2: null, im3l: null, im3u: null });
    setIP3Res(null);
    if (shouldClearMarkers) {
      markerDispatch({ type: 'CLEAR_ALL' });
    }
  }, [markerDispatch, stripIP3Markers]);

  const syncFromMarkers = useCallback((markers: Marker[]) => {
    const pts = getIP3PointsFromMarkers(markers);
    setIP3Pts(pts);
    setIP3Res(calcIP3FromPoints(pts));
  }, []);

  const saveIP3 = useCallback((trace: Trace) => {
    const saved = makeSavedIP3Result(ip3Res, ip3Pts, ip3Gain, {
      traceLabel: trace.dn || trace.name,
      sourceTraceId: trace.id,
      sourceTraceName: trace.name
    });
    if (!saved) return;
    analysisDispatch({ type: 'SET_IP3_RESULT', payload: { id: String(saved.id), result: ip3Res } });
  }, [ip3Res, ip3Pts, ip3Gain, analysisDispatch]);

  return {
    ip3Pts,
    setIP3Pts,
    ip3Res,
    setIP3Res,
    ip3Gain,
    setIP3Gain,
    ip3Results,
    setIP3Results: (_val: Record<string, IP3Result | null>) => undefined,
    stripIP3Markers,
    resetIP3,
    syncFromMarkers,
    saveIP3,
  };
}
