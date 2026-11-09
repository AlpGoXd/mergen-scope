import { useEffect } from 'react';
import { useOptionalAggregateWorkspace } from '../stores/aggregate-workspace-store';
import { useMarkerState, useMarkerDispatch } from '../stores/marker-store';
import { usePaneDispatch } from '../stores/pane-store';
import { useRefLineDispatch } from '../stores/ref-line-store';
import { useUiState, useUiDispatch } from '../stores/ui-store';

/**
 * Hook for global application keyboard shortcuts.
 */
export function useKeyboard() {
  const historyDispatch = useOptionalAggregateWorkspace()?.historyDispatch;
  const { selectedMkrIdx, markers } = useMarkerState();
  const markerDispatch = useMarkerDispatch();
  const paneDispatch = usePaneDispatch();
  const refLineDispatch = useRefLineDispatch();
  const { showMarkers } = useUiState();
  const uiDispatch = useUiDispatch();

  useEffect(() => {
    const handleKeyDown = (ev: KeyboardEvent) => {
      // Native controls, open modal dialogs and menus own their keyboard input.
      if (ev.defaultPrevented || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const target = ev.target instanceof HTMLElement ? ev.target : null;

      // Undo / redo work while a button, checkbox or menu has focus; only text fields keep their native undo.
      if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && historyDispatch && !isTextEntry(target)) {
        const key=ev.key.toLowerCase();
        if (key === 'z' || key === 'y') {
          historyDispatch({type:key === 'y' || ev.shiftKey ? 'redo' : 'undo'}); ev.preventDefault(); return;
        }
      }

      if (target && (target.isContentEditable || target.closest('input, textarea, select, button, [contenteditable="true"], [role="menu"], [role="menuitem"]'))) return;

      // Delete / Backspace: Remove selected marker
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        if (selectedMkrIdx >= 0 && markers[selectedMkrIdx]) {
          markerDispatch({ type: 'REMOVE_MARKER', payload: selectedMkrIdx });
          ev.preventDefault();
        }
      }

      // Escape: Clear selections
      if (ev.key === 'Escape') {
        markerDispatch({ type: 'ARM', payload: null });
        markerDispatch({ type: 'SET_SELECTED_IDX', payload: -1 });
        refLineDispatch({ type: 'SET_SELECTED', payload: null });
        uiDispatch({ type: 'SET', payload: { key: 'selectedTraceName', value: null } });
        uiDispatch({ type: 'SET', payload: { key: 'selectedRefLineId', value: null } });
      }

      if (ev.key.toLowerCase() === 'n' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        const selected=markers[selectedMkrIdx];
        if (ev.shiftKey) { if (selected && selected.type !== 'delta') markerDispatch({type:'ARM',payload:{kind:'delta',refId:selected.id}}); }
        else markerDispatch({type:'ARM',payload:{kind:'normal'}});
        ev.preventDefault();
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
  }, [selectedMkrIdx, markers, markerDispatch, paneDispatch, refLineDispatch, uiDispatch, showMarkers, historyDispatch]);
}

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image']);
/** True when the focused element edits text, so Ctrl+Z belongs to it rather than to workspace history. */
export function isTextEntry(target: HTMLElement | null): boolean {
  if (!target) return false;
  if (target.isContentEditable || target.closest('textarea, select, [contenteditable="true"]')) return true;
  const input = target.closest('input');
  return input instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(input.type);
}
