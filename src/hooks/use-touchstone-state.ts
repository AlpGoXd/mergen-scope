import { useState, useCallback, useEffect } from 'react';
import { useFileState, useFileDispatch } from '../stores/file-store';
import { 
  makeDefaultTouchstoneState, 
  cloneTouchstoneSelectionState, 
  reconcileTouchstoneFileSelections 
} from '../domain/touchstone/selections';
import type { TouchstoneSelectionState, TouchstoneFamily, TouchstoneView } from '../types/touchstone';

/**
 * Hook for managing Touchstone-specific UI state and trace reconciliation.
 * Ported from app-controller.js logic.
 */
export function useTouchstoneState() {
  const { files } = useFileState();
  const fileDispatch = useFileDispatch();
  const [touchstoneStateByFileId, setTouchstoneStateByFileId] = useState<Record<string, TouchstoneSelectionState>>({});

  // Initialize/Sync Touchstone states when files change
  useEffect(() => {
    setTouchstoneStateByFileId(prev => {
      const next = { ...prev };
      let changed = false;

      files.forEach(file => {
        if (!file.touchstoneNetwork) return;
        if (!next[file.id]) {
          next[file.id] = makeDefaultTouchstoneState(file);
          changed = true;
        }
      });

      // Cleanup removed files
      Object.keys(next).forEach(id => {
        if (!files.some(f => f.id === id)) {
          delete next[id];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [files]);

  /** Update selection state for a specific file and reconcile traces. */
  const updateFileSelection = useCallback((fileId: string, updater: (prev: TouchstoneSelectionState) => TouchstoneSelectionState) => {
    const file = files.find(f => f.id === fileId);
    if (!file || !file.touchstoneNetwork) return;

    setTouchstoneStateByFileId(prev => {
      const currentState = prev[fileId] || makeDefaultTouchstoneState(file);
      const nextState = updater(cloneTouchstoneSelectionState(currentState));
      
      // Reconcile traces in the store
      const updatedFile = reconcileTouchstoneFileSelections(file, nextState);
      fileDispatch({ type: 'UPDATE_FILE', payload: { file: updatedFile } });

      return { ...prev, [fileId]: nextState };
    });
  }, [files, fileDispatch]);

  /** Helper to toggle a cell selection. */
  const toggleCell = useCallback((fileId: string, family: TouchstoneFamily, row: number, col: number, view: TouchstoneView) => {
    updateFileSelection(fileId, prev => {
      const next = cloneTouchstoneSelectionState(prev);
      const key = `${row}:${col}`;
      const familyCells = next.selectedCellsByFamily[family] || {};
      const currentViews = familyCells[key] || [];

      if (currentViews.includes(view)) {
        familyCells[key] = currentViews.filter(v => v !== view);
        if (familyCells[key].length === 0) delete familyCells[key];
      } else {
        familyCells[key] = [...currentViews, view];
      }
      
      next.selectedCellsByFamily[family] = familyCells;
      return next;
    });
  }, [updateFileSelection]);

  /** Helper to change active family. */
  const setActiveFamily = useCallback((fileId: string, family: TouchstoneFamily) => {
    updateFileSelection(fileId, prev => ({ ...prev, activeFamily: family }));
  }, [updateFileSelection]);

  /** Helper to change active view for a family. */
  const setActiveView = useCallback((fileId: string, family: TouchstoneFamily, view: TouchstoneView) => {
    updateFileSelection(fileId, prev => {
      const next = cloneTouchstoneSelectionState(prev);
      next.activeViewByFamily[family] = view;
      return next;
    });
  }, [updateFileSelection]);

  return {
    touchstoneStateByFileId,
    updateFileSelection,
    toggleCell,
    setActiveFamily,
    setActiveView
  };
}
