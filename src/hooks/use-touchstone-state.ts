import { useState, useCallback, useEffect } from 'react';
import { useFileState, useFileDispatch } from '../stores/file-store';
import { 
  makeDefaultTouchstoneState, 
  cloneTouchstoneSelectionState, 
  reconcileTouchstoneFileSelections,
  appendTouchstoneDisplayTrace,
} from '../domain/touchstone/selections';
import type { TouchstoneSelectionState, TouchstoneFamily, TouchstoneView } from '../types/touchstone';

function sanitizeView(family: TouchstoneFamily, view: TouchstoneView): TouchstoneView {
  if (family === 'S') {
    return view;
  }
  return view === 'dB' ? 'Mag' : view;
}

/**
 * Hook for managing Touchstone-specific UI state and trace reconciliation.
 * Ported from app-controller.js logic.
 */
export function useTouchstoneState() {
  const fileState = useFileState();
  const { files } = fileState;
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

  useEffect(() => {
      const nextFiles = fileState.files.map((file) => {
      if (!file.touchstoneNetwork || (file.displayTraces?.length ?? file.traces.length) > 0) {
        return file;
      }

      const state = touchstoneStateByFileId[file.id] || makeDefaultTouchstoneState(file);
      return reconcileTouchstoneFileSelections(file, state);
    });

    if (nextFiles.every((file, index) => file === fileState.files[index])) {
      return;
    }

    fileDispatch({
      type: 'RESTORE_FILES',
      payload: {
        files: nextFiles,
        rawFileData: fileState.rawFileData,
        vis: fileState.vis,
        wizardQueue: fileState.wizardQueue,
      },
    });
  }, [fileDispatch, fileState.files, fileState.rawFileData, fileState.vis, fileState.wizardQueue, touchstoneStateByFileId]);

  /** Update selection state for a specific file and reconcile traces. */
  const updateFileSelection = useCallback((fileId: string, updater: (prev: TouchstoneSelectionState) => TouchstoneSelectionState) => {
    const file = files.find(f => String(f.id) === String(fileId));
    if (!file || !file.touchstoneNetwork) return;

    const currentState = touchstoneStateByFileId[fileId] || makeDefaultTouchstoneState(file);
    const nextState = updater(cloneTouchstoneSelectionState(currentState));
    const reconciled = reconcileTouchstoneFileSelections(file, nextState);

    // Two independent stores: dispatch each directly rather than nesting one
    // inside the other's setState updater (that trips React's "cannot update
    // a component while rendering a different component" and can drop the update).
    setTouchstoneStateByFileId(prev => ({ ...prev, [fileId]: nextState }));
    fileDispatch({
      type: 'RESTORE_FILES',
      payload: {
        files: fileState.files.map((current) => (String(current.id) === String(fileId) ? reconciled : current)),
        rawFileData: fileState.rawFileData,
        vis: fileState.vis,
        wizardQueue: fileState.wizardQueue,
      },
    });
  }, [fileDispatch, fileState.files, fileState.rawFileData, fileState.vis, fileState.wizardQueue, files, touchstoneStateByFileId]);

  /** Append a new trace from the active family/view and cell. */
  const appendCell = useCallback((fileId: string, family: TouchstoneFamily, row: number, col: number, view: TouchstoneView) => {
    const file = files.find((entry) => String(entry.id) === String(fileId));
    if (!file || !file.touchstoneNetwork) return;

    const safeView = sanitizeView(family, view);
    const cellKey = `${row}:${col}`;
    const currentState = touchstoneStateByFileId[fileId] || makeDefaultTouchstoneState(file);
    const nextState = cloneTouchstoneSelectionState(currentState);
    const existingViews = nextState.selectedCellsByFamily[family][cellKey] || [];
    const updatedState: TouchstoneSelectionState = {
      ...nextState,
      activeFamily: family,
      activeViewByFamily: {
        ...nextState.activeViewByFamily,
        [family]: safeView,
      },
      selectedCellsByFamily: {
        ...nextState.selectedCellsByFamily,
        [family]: {
          ...nextState.selectedCellsByFamily[family],
          // Track the cell in the declarative selection state too, so a later
          // family/view switch (which reconciles from this state) doesn't drop it.
          [cellKey]: existingViews.includes(safeView) ? existingViews : [...existingViews, safeView],
        },
      },
    };
    const reconciled = appendTouchstoneDisplayTrace(file, updatedState, family, row, col, safeView);

    setTouchstoneStateByFileId((prev) => ({ ...prev, [fileId]: updatedState }));
    fileDispatch({
      type: 'RESTORE_FILES',
      payload: {
        files: fileState.files.map((current) => (String(current.id) === String(fileId) ? reconciled : current)),
        rawFileData: fileState.rawFileData,
        vis: fileState.vis,
        wizardQueue: fileState.wizardQueue,
      },
    });
  }, [fileDispatch, fileState.files, fileState.rawFileData, fileState.vis, fileState.wizardQueue, files, touchstoneStateByFileId]);

  /** Helper to change active family. */
  const setActiveFamily = useCallback((fileId: string, family: TouchstoneFamily) => {
    updateFileSelection(fileId, prev => ({
      ...prev,
      activeFamily: family,
      activeViewByFamily: {
        ...prev.activeViewByFamily,
        [family]: sanitizeView(family, prev.activeViewByFamily[family]),
      },
    }));
  }, [updateFileSelection]);

  /** Helper to change active view for a family. */
  const setActiveView = useCallback((fileId: string, family: TouchstoneFamily, view: TouchstoneView) => {
    updateFileSelection(fileId, prev => {
      const next = cloneTouchstoneSelectionState(prev);
      next.activeViewByFamily[family] = sanitizeView(family, view);
      return next;
    });
  }, [updateFileSelection]);

  return {
    touchstoneStateByFileId,
    updateFileSelection,
    appendCell,
    setActiveFamily,
    setActiveView
  };
}
