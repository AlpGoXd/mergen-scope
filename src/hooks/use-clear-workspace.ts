import { useFileState, useFileDispatch } from '../stores/file-store';
import { useMarkerState, useMarkerDispatch } from '../stores/marker-store';
import { useRefLineState, useRefLineDispatch } from '../stores/ref-line-store';
import { usePaneDispatch } from '../stores/pane-store';
import { useOptionalAggregateWorkspace } from '../stores/aggregate-workspace-store';

/**
 * "Clear workspace": removes every file, marker and line and resets all zooms. With workspace history it is one
 * undoable transaction with a "Cleared workspace" toast; without it each store is cleared directly.
 * `canClear` is false when there is nothing to clear.
 */
export function useClearWorkspace() {
  const { files } = useFileState(); const fileDispatch = useFileDispatch();
  const { markers } = useMarkerState(); const markerDispatch = useMarkerDispatch();
  const { refLines } = useRefLineState(); const lineDispatch = useRefLineDispatch();
  const paneDispatch = usePaneDispatch();
  const aggregate = useOptionalAggregateWorkspace();
  const canClear = files.length > 0 || markers.length > 0 || refLines.length > 0;
  const clearWorkspace = () => {
    if (aggregate) {
      aggregate.historyDispatch({type:'change',toastMessage:'Cleared workspace',toastKind:'delete',command:{slice:'transaction', actions:[
        ...files.map(file => ({slice:'files' as const,action:{type:'REMOVE_FILE' as const,payload:{fileId:String(file.id)}}})),
        {slice:'markers',action:{type:'CLEAR_ALL'}},
        ...refLines.map(line => ({slice:'lines' as const,action:{type:'REMOVE_LINE' as const,payload:line.id}})),
        {slice:'panes',limit:4,action:{type:'CLEAR_ALL_ZOOMS'}},
      ]}}); return;
    }
    files.forEach(file => fileDispatch({type:'REMOVE_FILE',payload:{fileId:String(file.id)}}));
    markerDispatch({type:'CLEAR_ALL'}); refLines.forEach(line => lineDispatch({type:'REMOVE_LINE',payload:line.id}));
    paneDispatch({type:'CLEAR_ALL_ZOOMS'});
  };
  return { clearWorkspace, canClear };
}
