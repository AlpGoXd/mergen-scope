import { useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import type { WorkspaceSnapshotV5 } from '../types/workspace-v5';
import { syncParserFileCounter } from '../domain/parsers/rs-dat';
import { syncTraceIdCounter } from '../domain/trace-model';
import { useAggregateWorkspace } from '../stores/aggregate-workspace-store';
import type { OpenDataCommand } from '../stores/aggregate-workspace-store';
import { useAsk } from '../stores/dialog-store';
import { replaceWorkspaceText, sameNameText, warnLargeFileText } from '../domain/confirm-text';
import { classifyReadBinary, classifyReadFile, maxTraceSerial, workspaceCounts } from '../domain/open-file-read';
import { BINARY_SNIFF_BYTES, detectBinarySignature } from '../domain/parsers/binary-detect';
import { isStrictRawBinaryExtension } from '../domain/parsers/raw-binary';
import { copyName } from '../domain/open-files-plan';
import { classifyFileSize, refuseLargeFileMessage } from '../domain/file-size-policy';
import { usePaneLimit } from '../stores/pane-store';
import type { OpenChoice } from '../types/open-files-plan';

export const DATA_FILE_ACCEPT = [
  '.csv', '.tsv', '.txt', '.dat',
  '.bin', '.trc', '.isf',
  '.cfile', '.cf32', '.fc32', '.sc16', '.cs16', '.cu8', '.cs8', '.iq', '.f32', '.f64', '.i32', '.u32', '.i16', '.u8',
  ...Array.from({ length: 16 }, (_, i) => `.s${i + 1}p`),
].join(',');
let issuedImportId = 0;
function nextImportId(): string { issuedImportId += 1; return `import-${Date.now()}-${issuedImportId}`; }

export { workspaceCounts };

/** Read and parse first; the aggregate reducer plans against the latest workspace. */
export function useFileImport() {
  const workspace=useAggregateWorkspace();
  const ask=useAsk();
  const stateRef=useRef(workspace.state); stateRef.current=workspace.state;
  const {limit}=usePaneLimit();
  const limitRef=useRef(limit); limitRef.current=limit;
  return useCallback(async (files: FileList | readonly File[], targetPaneId?:string, workspaceRoute = false, drop = false):Promise<void> => {
    // File inputs are cleared and drag data can become inaccessible once the event ends.
    const batch = Array.from(files);
    const accepted: File[] = [];
    for (const file of batch) {
      const bytes = file.size;
      const classification = classifyFileSize(bytes);
      if (classification === 'refuse') {
        workspace.dispatch({ slice: 'files', action: { type: 'REPORT_IMPORT_ERROR', payload: {
          fileName: file.name,
          message: refuseLargeFileMessage(bytes),
        } } });
        continue;
      }
      if (classification === 'warn' && await ask(warnLargeFileText(file.name, bytes)) !== 'confirm') continue;
      accepted.push(file);
    }
    if (!accepted.length) return;

    const read = await Promise.all(accepted.map(async file => {
      const id=nextImportId();
      try {
        if (!workspaceRoute && typeof file.slice === 'function' && typeof file.arrayBuffer === 'function') {
          const head = new Uint8Array(await file.slice(0, BINARY_SNIFF_BYTES).arrayBuffer());
          const hasBinaryBytes = head.some(byte => byte === 0 || (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d));
          const isJsonLike = /\.json$/i.test(file.name);
          if (detectBinarySignature(head) || isStrictRawBinaryExtension(file.name) || (!isJsonLike && hasBinaryBytes)) {
            return classifyReadBinary(file.name, await file.arrayBuffer(), id);
          }
        }
        const text=await file.text();
        return classifyReadFile(file.name, text, workspaceRoute, id);
      } catch(error) {
        if (/\.json$/i.test(file.name) || workspaceRoute) return {kind:'invalid-workspace' as const,name:file.name};
        return {kind:'data' as const,input:{id,name:file.name,text:'',parsed:null,error:error instanceof Error ? error.message : 'Could not read this file.'}};
      }
    }));
    // Flush any queued user commands before asking decisions against the current workspace.
    flushSync(() => {});
    const invalid=read.find(item=>item.kind==='invalid-workspace');
    if (invalid?.kind==='invalid-workspace') {workspace.dispatch({slice:'files',action:{type:'REPORT_IMPORT_ERROR',payload:{fileName:invalid.name,message:'Not a valid workspace. The current workspace was left unchanged.'}}});return;}
    const workspaces=read.filter(item=>item.kind==='workspace');
    if (workspaces.length > 1) {workspace.dispatch({slice:'files',action:{type:'REPORT_IMPORT_ERROR',payload:{fileName:'Workspace',message:'Open only one workspace at a time.'}}});return;}
    const loaded=workspaces[0];
    let workspaceInput: {snapshot:WorkspaceSnapshotV5;legacy:boolean;choice?:'replace'|'cancel'} | undefined;
    if (loaded?.kind==='workspace') {
      const counts=workspaceCounts(stateRef.current);
      const hasWork=counts!==null;
      if (counts && await ask(replaceWorkspaceText(counts, accepted.find(file=>/\.json$/i.test(file.name))?.name))!=='confirm') return;
      workspaceInput={snapshot:loaded.snapshot,legacy:loaded.legacy,choice:hasWork ? 'replace' : undefined};
      const traces=[...loaded.snapshot.files.flatMap(file=>file.traces),...loaded.snapshot.derivedTraces];
      syncTraceIdCounter(traces);
      syncParserFileCounter(maxTraceSerial(traces));
    }
    const inputs:OpenDataCommand[]=read.flatMap(item=>item.kind==='data' ? [item.input] : []);
    const names=new Set((workspaceInput?.snapshot.files ?? stateRef.current.files.files).map(file=>file.fileName));
    const chosen: OpenDataCommand[]=[];
    for (const input of inputs) {
      let choice:OpenChoice | undefined;
      if(names.has(input.name)) {
        const answer=await ask(sameNameText(input.name, copyName(input.name, names)));
        if(answer === 'cancel') return;
        choice=answer === 'confirm' ? 'replace' : 'copy';
      }
      const existing=(workspaceInput?.snapshot.files ?? stateRef.current.files.files).find(file=>file.fileName===input.name);
      chosen.push({...input,choice,expectedFileId:choice==='replace' && existing ? String(existing.id) : undefined}); names.add(input.name);
    }
    workspace.historyDispatch({type:'change',toastMessage:`Opened ${chosen.length} file${chosen.length === 1 ? '' : 's'}`,toastKind:'opened',command:{slice:'open-data',inputs:chosen,targetPaneId,drop,limit:limitRef.current,workspace:workspaceInput}});
  },[workspace.historyDispatch,workspace.dispatch,ask]);
}
