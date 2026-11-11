import { useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import { parseMeasurementFile } from '../domain/parsers/parse-file';
import { classify } from '../domain/parsers/classifier';
import { migrateWorkspaceV5 } from '../domain/workspace-migrate-v5';
import type { WorkspaceSnapshotV5 } from '../types/workspace-v5';
import { syncParserFileCounter } from '../domain/parsers/rs-dat';
import { syncTraceIdCounter } from '../domain/trace-model';
import { useAggregateWorkspace } from '../stores/aggregate-workspace-store';
import type { OpenDataCommand } from '../stores/aggregate-workspace-store';
import { usePaneLimit } from '../stores/pane-store';
import type { OpenChoice } from '../types/open-files-plan';

export const DATA_FILE_ACCEPT = ['.csv', '.tsv', '.txt', '.dat', ...Array.from({ length: 16 }, (_, i) => `.s${i + 1}p`)].join(',');
let issuedImportId = 0;
function nextImportId(): string { issuedImportId += 1; return `import-${Date.now()}-${issuedImportId}`; }

/** Read and parse first; the aggregate reducer plans against the latest workspace. */
export function useFileImport() {
  const workspace=useAggregateWorkspace();
  const stateRef=useRef(workspace.state); stateRef.current=workspace.state;
  const {limit}=usePaneLimit();
  const limitRef=useRef(limit); limitRef.current=limit;
  return useCallback(async (files: FileList | readonly File[], targetPaneId?:string, workspaceRoute = false, drop = false):Promise<void> => {
    const read = await Promise.all(Array.from(files).map(async file => {
      const id=nextImportId();
      try {
        const text=await file.text();
        const extensionSuggestsWorkspace = /\.json$/i.test(file.name);
        let raw: unknown;
        let isWorkspaceEnvelope = false;
        if (extensionSuggestsWorkspace || workspaceRoute || text.trimStart().startsWith('{')) {
          try {
            raw = JSON.parse(text);
            isWorkspaceEnvelope = !!raw && typeof raw === 'object' && !Array.isArray(raw)
              && 'kind' in raw && raw.kind === 'mergen-scope-workspace';
          } catch {
            if (extensionSuggestsWorkspace || workspaceRoute) return {kind:'invalid-workspace' as const,name:file.name};
          }
        }
        if (extensionSuggestsWorkspace || workspaceRoute || isWorkspaceEnvelope) {
          const snapshot=migrateWorkspaceV5(raw);
          if (!snapshot) return {kind:'invalid-workspace' as const,name:file.name};
          const body=raw && typeof raw==='object' && 'kind' in raw && raw.kind==='mergen-scope-workspace' && 'snapshot' in raw ? raw.snapshot : raw;
          return {kind:'workspace' as const,snapshot,legacy:!(body && typeof body==='object' && 'version' in body && body.version===5)};
        }
        const profile=classify(text,file.name);
        if (profile.format === 'binary') return {kind:'data' as const,input:{id,name:file.name,text,parsed:null,error:'Binary files cannot be opened as measurement data.'}};
        return {kind:'data' as const,input:{id,name:file.name,text,parsed:parseMeasurementFile(text,file.name,profile)}};
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
      const current=stateRef.current;
      const hasWork=current.files.files.length>0 || current.traces.derivedTraces.length>0 || current.markers.markers.length>0 || current.lines.refLines.length>0 || current.panes.panes.length>1;
      if (hasWork && !window.confirm('Replace the current workspace?')) return;
      workspaceInput={snapshot:loaded.snapshot,legacy:loaded.legacy,choice:hasWork ? 'replace' : undefined};
      const traces=[...loaded.snapshot.files.flatMap(file=>file.traces),...loaded.snapshot.derivedTraces];
      syncTraceIdCounter(traces);
      syncParserFileCounter(traces.reduce((max,trace)=>{const serial=Number(/_(\d+)$/.exec(trace.name)?.[1]);return Number.isFinite(serial) ? Math.max(max,serial) : max;},0));
    }
    const inputs:OpenDataCommand[]=read.flatMap(item=>item.kind==='data' ? [item.input] : []);
    const names=new Set((workspaceInput?.snapshot.files ?? stateRef.current.files.files).map(file=>file.fileName));
    const chosen: OpenDataCommand[]=[];
    for (const input of inputs) {
      let choice:OpenChoice | undefined;
      if(names.has(input.name)) {
        const answer=window.prompt(`${input.name} is already open. Type replace or copy, or cancel opening.`, 'copy');
        if(answer === null) return;
        const normalized=answer.trim().toLowerCase();
        if(normalized !== 'replace' && normalized !== 'copy') return;
        choice=normalized;
      }
      const existing=(workspaceInput?.snapshot.files ?? stateRef.current.files.files).find(file=>file.fileName===input.name);
      chosen.push({...input,choice,expectedFileId:choice==='replace' && existing ? String(existing.id) : undefined}); names.add(input.name);
    }
    workspace.historyDispatch({type:'change',toastMessage:`Opened ${chosen.length} file${chosen.length === 1 ? '' : 's'}`,toastKind:'opened',command:{slice:'open-data',inputs:chosen,targetPaneId,drop,limit:limitRef.current,workspace:workspaceInput}});
  },[workspace.historyDispatch,workspace.dispatch]);
}
