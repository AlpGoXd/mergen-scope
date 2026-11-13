import { useEffect, useRef } from 'react';
import { useOptionalAggregateWorkspace } from '../stores/aggregate-workspace-store';
import { useMarkerState, useMarkerDispatch } from '../stores/marker-store';
import { usePaneDispatch, usePaneState } from '../stores/pane-store';
import { useRefLineDispatch, useRefLineState } from '../stores/ref-line-store';
import { useUiDispatch } from '../stores/ui-store';
import { useTraceState } from '../stores/trace-store';
import { useShortcut } from '../stores/shortcut-store';
import { nearestIndexByFreq } from '../domain/markers';
import { pruneZoomHistory, recordZoom, sameZoom, takePreviousZoom } from '../domain/zoom-history';
import type { PaneZoom, ZoomHistory } from '../domain/zoom-history';

export { isTextEntry } from '../stores/shortcut-store';

/**
 * Handlers for the workspace shortcuts of src/domain/shortcuts.ts: markers, lines, the target pane's zoom and
 * history. The keys themselves are bound once by ShortcutProvider.
 */
export function useKeyboard() {
  const historyDispatch = useOptionalAggregateWorkspace()?.historyDispatch;
  const { selectedMkrIdx, markers } = useMarkerState();
  const markerDispatch = useMarkerDispatch();
  const { panes, activePaneId, paneXZooms, paneYZooms } = usePaneState();
  const paneDispatch = usePaneDispatch();
  const { selectedRefLineId, refLines } = useRefLineState();
  const refLineDispatch = useRefLineDispatch();
  const uiDispatch = useUiDispatch();
  const { allTraces } = useTraceState();
  const targetPaneId = panes.some(pane => pane.id === activePaneId) ? activePaneId : panes[0]?.id ?? null;
  const selected = selectedMkrIdx >= 0 ? markers[selectedMkrIdx] : undefined;

  // Previous zoom: watch every pane's zoom; Backspace restores the target pane's last step.
  const zoomHistory = useRef<ZoomHistory>(new Map());
  const restoring = useRef(new Map<string, PaneZoom>());
  useEffect(() => {
    const now = Date.now();
    let history = pruneZoomHistory(zoomHistory.current, panes.map(pane => pane.id));
    for (const pane of panes) {
      const zoom: PaneZoom = { x: paneXZooms[pane.id] ?? null, y: paneYZooms[pane.id] ?? null };
      const expected = restoring.current.get(pane.id);
      const isRestore = !!expected && sameZoom(expected, zoom);
      if (isRestore) restoring.current.delete(pane.id);
      history = recordZoom(history, pane.id, zoom, now, isRestore);
    }
    zoomHistory.current = history;
  }, [panes, paneXZooms, paneYZooms]);

  const cancel = () => {
    markerDispatch({ type: 'ARM', payload: null });
    refLineDispatch({ type: 'SET_MODE', payload: null });
    markerDispatch({ type: 'SET_SELECTED_IDX', payload: -1 });
    refLineDispatch({ type: 'SET_SELECTED', payload: null });
    uiDispatch({ type: 'SET', payload: { key: 'selectedTraceName', value: null } });
    uiDispatch({ type: 'SET', payload: { key: 'selectedRefLineId', value: null } });
  };

  useShortcut('new-marker', () => { refLineDispatch({ type: 'SET_MODE', payload: null }); markerDispatch({ type: 'ARM', payload: { kind: 'normal' } }); });
  useShortcut('delta-marker', () => {
    if (!selected || selected.type === 'delta') return false;
    refLineDispatch({ type: 'SET_MODE', payload: null });
    markerDispatch({ type: 'ARM', payload: { kind: 'delta', refId: selected.id } });
  });
  useShortcut('escape', () => { cancel(); });
  useShortcut('fit-pane', () => {
    if (!targetPaneId) return false;
    paneDispatch({ type: 'SET_PANE_ZOOM', payload: { paneId: targetPaneId, zoom: null } });
    paneDispatch({ type: 'SET_PANE_Y_ZOOM', payload: { paneId: targetPaneId, zoom: null } });
    // Smith panes keep their own view; ChartPane fits it on this event.
    window.dispatchEvent(new CustomEvent('mergen-fit-pane', { detail: { paneId: targetPaneId } }));
  });
  useShortcut('previous-zoom', () => {
    if (!targetPaneId) return false;
    const step = takePreviousZoom(zoomHistory.current, targetPaneId);
    if (!step) return false;
    zoomHistory.current = step.history;
    restoring.current.set(targetPaneId, step.zoom);
    paneDispatch({ type: 'SET_PANE_ZOOM', payload: { paneId: targetPaneId, zoom: step.zoom.x } });
    paneDispatch({ type: 'SET_PANE_Y_ZOOM', payload: { paneId: targetPaneId, zoom: step.zoom.y } });
  });
  useShortcut('delete', () => {
    if (selected) { markerDispatch({ type: 'REMOVE_MARKER', payload: selectedMkrIdx }); return; }
    const line = refLines.find(item => item.id === selectedRefLineId);
    if (!line) return false;
    const action = { type: 'REMOVE_LINE' as const, payload: line.id };
    const name = line.label ?? (line.type === 'v' ? 'V' : 'H');
    if (historyDispatch) historyDispatch({ type: 'change', toastMessage: `Deleted ${name}`, toastKind: 'delete', command: { slice: 'lines', action } });
    else refLineDispatch(action);
  });
  useShortcut('move-marker', stroke => {
    const trace = selected ? allTraces.find(item => item.name === selected.trace) : undefined;
    if (!selected || !trace || trace.data.length === 0) return false;
    const index = nearestIndexByFreq(trace.data, selected.freq) + (stroke.key === 'ArrowLeft' ? -1 : 1);
    const point = trace.data[Math.max(0, Math.min(trace.data.length - 1, index))];
    if (!point || point.freq === selected.freq) return;
    // One Undo step per press, like the end of a marker drag.
    historyDispatch?.({ type: 'begin-gesture' });
    markerDispatch({ type: 'UPDATE_MARKER', payload: { idx: selectedMkrIdx, updates: { requestedFreq: point.freq, freq: point.freq, amp: point.amp, interpolated: false } } });
    historyDispatch?.({ type: 'commit-gesture' });
  });
  useShortcut('undo', () => { if (!historyDispatch) return false; historyDispatch({ type: 'undo' }); });
  useShortcut('redo', () => { if (!historyDispatch) return false; historyDispatch({ type: 'redo' }); });
}
