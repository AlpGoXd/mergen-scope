import { useEffect } from 'react';
import { useMarkerState, useMarkerDispatch } from '../stores/marker-store';
import { usePaneDispatch } from '../stores/pane-store';
import { useRefLineDispatch } from '../stores/ref-line-store';
import { useUiState, useUiDispatch } from '../stores/ui-store';

/**
 * Hook for global application keyboard shortcuts.
 */
export function useKeyboard() {
  const { selectedMkrIdx, markers } = useMarkerState();
  const markerDispatch = useMarkerDispatch();
  const paneDispatch = usePaneDispatch();
  const refLineDispatch = useRefLineDispatch();
  const { showMarkers } = useUiState();
  const uiDispatch = useUiDispatch();

  useEffect(() => {
    const handleKeyDown = (ev: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input
      const target = ev.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Delete / Backspace: Remove selected marker
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        if (selectedMkrIdx >= 0 && markers[selectedMkrIdx]) {
          markerDispatch({ type: 'REMOVE_MARKER', payload: selectedMkrIdx });
          ev.preventDefault();
        }
      }

      // Escape: Clear selections
      if (ev.key === 'Escape') {
        markerDispatch({ type: 'SET_SELECTED_IDX', payload: -1 });
        refLineDispatch({ type: 'SET_SELECTED', payload: null });
        uiDispatch({ type: 'SET', payload: { key: 'selectedTraceName', value: null } });
        uiDispatch({ type: 'SET', payload: { key: 'selectedRefLineId', value: null } });
      }

      // 1-4: Set pane layout
      if (ev.key === '1') {
        paneDispatch({ type: 'SET_PANE_COUNT', payload: 1 });
      } else if (ev.key === '2') {
        paneDispatch({ type: 'SET_PANE_COUNT', payload: 2 });
      } else if (ev.key === '3') {
        paneDispatch({ type: 'SET_PANE_COUNT', payload: 3 });
      } else if (ev.key === '4') {
        paneDispatch({ type: 'SET_PANE_COUNT', payload: 4 });
      }

      // M: Toggle markers
      if (ev.key.toLowerCase() === 'm' && !ev.ctrlKey && !ev.metaKey) {
        uiDispatch({ type: 'SET', payload: { key: 'showMarkers', value: !showMarkers } });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedMkrIdx, markers, markerDispatch, paneDispatch, refLineDispatch, uiDispatch, showMarkers]);
}
