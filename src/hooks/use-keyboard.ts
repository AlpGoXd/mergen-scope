import { useEffect } from 'react';
import { useMarkerState, useMarkerDispatch } from '../stores/marker-store';
import { usePaneDispatch } from '../stores/pane-store';
import { useUiState, useUiDispatch } from '../stores/ui-store';

/**
 * Hook for global application keyboard shortcuts.
 */
export function useKeyboard() {
  const { selectedMkrIdx, markers } = useMarkerState();
  const markerDispatch = useMarkerDispatch();
  const paneDispatch = usePaneDispatch();
  const { selectedTraceName } = useUiState();
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
        if (selectedMkrIdx !== null && markers[selectedMkrIdx]) {
          markerDispatch({ type: 'REMOVE_MARKER', index: selectedMkrIdx });
          ev.preventDefault();
        }
      }

      // Escape: Clear selections
      if (ev.key === 'Escape') {
        markerDispatch({ type: 'SET_SELECTED_MARKER', index: null });
        uiDispatch({ type: 'SET_SELECTED_TRACE', name: null });
        uiDispatch({ type: 'SET_SELECTED_REF_LINE', id: null });
      }

      // 1-4: Set pane layout
      if (ev.key === '1') {
        paneDispatch({ type: 'SET_PANE_COUNT', count: 1 });
      } else if (ev.key === '2') {
        paneDispatch({ type: 'SET_PANE_COUNT', count: 2 });
      } else if (ev.key === '3') {
        paneDispatch({ type: 'SET_PANE_COUNT', count: 3 });
      } else if (ev.key === '4') {
        paneDispatch({ type: 'SET_PANE_COUNT', count: 4 });
      }

      // M: Toggle markers
      if (ev.key.toLowerCase() === 'm' && !ev.ctrlKey && !ev.metaKey) {
        uiDispatch({ type: 'SET_SHOW_MARKERS', show: (prev: any) => !prev });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedMkrIdx, markers, markerDispatch, paneDispatch, uiDispatch]);
}
