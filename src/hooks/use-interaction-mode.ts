import { useCallback } from 'react';
import { useMarkerState, useMarkerDispatch } from '../stores/marker-store';
import { useRefLineState, useRefLineDispatch } from '../stores/ref-line-store';
export function useInteractionMode() {
  const { markers, selectedMkrIdx, armed } = useMarkerState(); const markerDispatch = useMarkerDispatch();
  const { refMode } = useRefLineState(); const refLineDispatch = useRefLineDispatch();
  const selectNormal = useCallback(() => { refLineDispatch({type:'SET_MODE',payload:null}); markerDispatch({type:'ARM',payload:{kind:'normal'}}); },[refLineDispatch,markerDispatch]);
  const selectDelta = useCallback(() => { const selected=markers[selectedMkrIdx]; const ref=selected && selected.type !== 'delta' ? selected : markers.find(marker=>marker.type !== 'delta'); if (!ref) return; refLineDispatch({type:'SET_MODE',payload:null}); markerDispatch({type:'ARM',payload:{kind:'delta',refId:ref.id}}); },[markers,selectedMkrIdx,refLineDispatch,markerDispatch]);
  const clearRefPlacement = useCallback(() => refLineDispatch({type:'SET_MODE',payload:null}),[refLineDispatch]);
  const toggleRefPlacement = useCallback((kind:'h'|'v'|null) => { markerDispatch({type:'ARM',payload:null}); refLineDispatch({type:'SET_MODE',payload:refMode===kind?null:kind}); },[markerDispatch,refLineDispatch,refMode]);
  const action = refMode === 'h' ? 'place-hline' : refMode === 'v' ? 'place-vline' : armed?.kind === 'delta' ? 'place-delta-marker' : armed ? 'place-marker' : null;
  const hint = action === 'place-hline' ? 'Click to place H-line' : action === 'place-vline' ? 'Click to place V-line' : action === 'place-delta-marker' ? 'Click to place a delta marker' : action === 'place-marker' ? 'Click to place a marker' : null;
  return { selectNormal, selectDelta, clearRefPlacement, toggleRefPlacement, action, hint };
}
