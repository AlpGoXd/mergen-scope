import { useCallback, useMemo } from 'react';
import { useFileState, useFileDispatch } from '../stores/file-store';
import { cloneTouchstoneSelectionState, touchstoneStateFromFile } from '../domain/touchstone/selections';
import type { TouchstoneSelectionState, TouchstoneFamily, TouchstoneView } from '../types/touchstone';

function sanitizeView(family: TouchstoneFamily, view: TouchstoneView): TouchstoneView {
  return family !== 'S' && ['dB', 'VSWR', 'Return loss'].includes(view) ? 'Mag' : view;
}

/** Matrix controls live with files; plotted selections are derived from display traces. */
export function useTouchstoneState() {
  const {files} = useFileState(); const dispatch = useFileDispatch();
  const touchstoneStateByFileId = useMemo(() => Object.fromEntries(files.filter(file => file.touchstoneNetwork).map(file => [String(file.id),touchstoneStateFromFile(file)])),[files]);
  const updateFileSelection = useCallback((fileId: string, updater: (prev: TouchstoneSelectionState) => TouchstoneSelectionState) => {
    const file = files.find(item => String(item.id) === fileId); if (!file?.touchstoneNetwork) return;
    const next = updater(cloneTouchstoneSelectionState(touchstoneStateFromFile(file)));
    dispatch({type:'SET_TOUCHSTONE_CONTROLS',payload:{fileId,controls:{activeFamily:next.activeFamily,activeViewByFamily:next.activeViewByFamily}}});
  },[files,dispatch]);
  const appendCell = useCallback((fileId: string, family: TouchstoneFamily, row: number, col: number, view: TouchstoneView) => {
    dispatch({type:'APPEND_TOUCHSTONE_VIEW',payload:{fileId,family,row,col,view:sanitizeView(family,view)}});
  },[dispatch]);
  const setActiveFamily = useCallback((fileId: string, family: TouchstoneFamily) => updateFileSelection(fileId, previous => ({...previous,activeFamily:family,activeViewByFamily:{...previous.activeViewByFamily,[family]:sanitizeView(family,previous.activeViewByFamily[family])}})),[updateFileSelection]);
  const setActiveView = useCallback((fileId: string, family: TouchstoneFamily, view: TouchstoneView) => updateFileSelection(fileId, previous => ({...previous,activeViewByFamily:{...previous.activeViewByFamily,[family]:sanitizeView(family,view)}})),[updateFileSelection]);
  return {touchstoneStateByFileId,updateFileSelection,appendCell,setActiveFamily,setActiveView};
}
