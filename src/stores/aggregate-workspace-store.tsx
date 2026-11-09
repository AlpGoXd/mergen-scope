import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import { fileReducer, defaultFileState, FileStateContext, FileDispatchContext } from './file-store';
import type { FileAction, FileState, PendingOpenInput } from './file-store';
import { traceReducer, defaultTraceState, TraceStateContext, TraceDispatchContext } from './trace-store';
import type { TraceAction, TraceState, TraceContextValue } from './trace-store';
import { paneReducer, defaultPaneState, PaneStateContext, PaneDispatchContext, PaneLimitContext } from './pane-store';
import type { PaneAction, PaneState } from './pane-store';
import { markerReducer, defaultMarkerState, MarkerStateContext, MarkerDispatchContext } from './marker-store';
import type { MarkerAction, MarkerState } from './marker-store';
import { refLineReducer, defaultRefLineState, RefLineStateContext, RefLineDispatchContext } from './ref-line-store';
import type { RefLineAction, RefLineState } from './ref-line-store';
import { analysisReducer, defaultAnalysisState, AnalysisStateContext, AnalysisDispatchContext } from './analysis-store';
import type { AnalysisAction, AnalysisState } from './analysis-store';
import { uiReducer, getInitialUiState, readThemePreference, UiStoreAdapter } from './ui-store';
import type { UiAction, UiState } from './ui-store';
import { adaptDisplayTracesToLegacyTraces } from '../domain/display-trace-adapter';
import { migrateWorkspaceV5 } from '../domain/workspace-migrate-v5';
import { canPlaceMembership, planPaneRemoval, planPaneTypeChange, traceXGroup } from '../domain/pane-placement';
import type { PlacementTrace } from '../domain/pane-placement';
import { encodeXAxisUnit } from '../types/ref-line';
import type { WorkspaceSnapshotV5 } from '../types/workspace-v5';
import type { RawFileRecord } from '../types/file';
import type { OpenData, OpenMember } from '../types/open-files-plan';
import { planOpenFiles } from '../domain/open-files-plan';
import { prepareOpenInput } from '../domain/prepare-open-input';
import { parseTabularFile } from '../domain/parsers/tabular';
import { placeMarker } from '../domain/markers';
import { createTransactionHistory, recordTransaction, undoTransaction, redoTransaction } from '../domain/transaction-history';
import type { TransactionHistory } from '../domain/transaction-history';
import { useOptionalToast } from './toast-store';
import type { ToastKind } from './toast-store';

export interface WorkspaceState {
  files: FileState; traces: TraceState; panes: PaneState; markers: MarkerState;
  lines: RefLineState; analysis: AnalysisState; ui: UiState; layout: WorkspaceSnapshotV5['layout']; revision: number;
}
type SliceAction =
  | { slice: 'files'; action: FileAction; limit?: 4 | 8 } | { slice: 'traces'; action: TraceAction }
  | { slice: 'panes'; action: PaneAction; limit: 4 | 8 } | { slice: 'markers'; action: MarkerAction }
  | { slice: 'lines'; action: RefLineAction } | { slice: 'analysis'; action: AnalysisAction }
  | { slice: 'ui'; action: UiAction };
export type OpenDataCommand = PendingOpenInput;
export type WorkspaceAction = {slice:'remove-last-pane'; targetPaneId:string; expectedRevision:number; confirmed:boolean; limit:4|8} | {slice:'open-data'; inputs:readonly OpenDataCommand[]; targetPaneId?:string; limit:4|8; resolveWizardId?:string; resolveBatchId?:string; workspace?:{readonly snapshot:WorkspaceSnapshotV5;readonly legacy:boolean;readonly choice?:'replace'|'cancel'}} | SliceAction | { slice: 'restore'; state: WorkspaceState } | { slice: 'transaction'; actions: readonly SliceAction[] } | { slice: 'deleteTrace'; traceId: string } | { slice: 'load'; snapshot: WorkspaceSnapshotV5; legacy: boolean };

export function initialWorkspaceState(): WorkspaceState {
  return { files: defaultFileState, traces: defaultTraceState, panes: defaultPaneState, markers: defaultMarkerState, lines: defaultRefLineState, analysis: defaultAnalysisState, ui: getInitialUiState(readThemePreference()), layout: {preset:'rows',paneOrder:['pane-1'],sizes:{}}, revision: 0 };
}
export function traceView(files: FileState, traces: TraceState): TraceContextValue {
  const rawKnown = files.files.flatMap(file => file.datasets?.length && file.displayTraces ? adaptDisplayTracesToLegacyTraces(file.datasets, file.displayTraces, file) : file.traces);
  const hidden = new Set(files.files.flatMap(file => (file.displayTraces ?? []).filter(display => display.hidden).map(display => display.id)));
  return { ...traces, allKnownTraces: [...rawKnown, ...traces.derivedTraces], allTraces: [...rawKnown.filter(trace => !hidden.has(trace.id)), ...traces.derivedTraces], allDatasets: files.files.flatMap(file => file.datasets ?? []), allDisplayTraces: files.files.flatMap(file => file.displayTraces ?? []) };
}

/** A history entry retains real immutable slices, without browser preferences or transient tools. */
export interface WorkspaceMemento {
  readonly files: FileState; readonly traces: TraceState; readonly panes: PaneState;
  readonly markers: MarkerState['markers']; readonly lines: RefLineState['refLines']; readonly analysis: AnalysisState;
  readonly layout: WorkspaceState['layout'];
  readonly ui: Pick<UiState, 'traceColors' | 'traceInterpolations' | 'noiseFilter' | 'noiseSource' | 'ip3Gain' | 'selectedTraceName'>;
}
export function captureWorkspace(state: WorkspaceState): WorkspaceMemento {
  const {traceColors, traceInterpolations, noiseFilter, noiseSource, ip3Gain, selectedTraceName} = state.ui;
  return {files:{...state.files,wizardQueue:state.files.wizardQueue.filter(entry => !entry.pendingBatch)}, traces:state.traces, panes:state.panes, markers:state.markers.markers, lines:state.lines.refLines, analysis:state.analysis, layout:state.layout, ui:{traceColors,traceInterpolations,noiseFilter,noiseSource,ip3Gain,selectedTraceName}};
}
export function sameWorkspaceMemento(a: WorkspaceMemento, b: WorkspaceMemento): boolean {
  return a.files === b.files && a.traces === b.traces && a.panes === b.panes && a.markers === b.markers && a.lines === b.lines && a.analysis === b.analysis && a.layout === b.layout && a.ui.traceColors === b.ui.traceColors && a.ui.traceInterpolations === b.ui.traceInterpolations && a.ui.noiseFilter === b.ui.noiseFilter && a.ui.noiseSource === b.ui.noiseSource && a.ui.ip3Gain === b.ui.ip3Gain && a.ui.selectedTraceName === b.ui.selectedTraceName;
}
export function restoreWorkspaceMemento(state: WorkspaceState, memento: WorkspaceMemento): WorkspaceState {
  return {
    ...state, files:{...memento.files,wizardQueue:[...memento.files.wizardQueue,...state.files.wizardQueue.filter(entry => entry.pendingBatch)]}, traces:memento.traces,
    panes:paneReducer(state.panes,{type:'RESTORE',payload:memento.panes}),
    markers:markerReducer(state.markers,{type:'RESTORE',payload:{...state.markers,markers:memento.markers,armed:null,selectedMkrIdx:-1}}),
    lines:{...state.lines,refLines:memento.lines,refMode:null,selectedRefLineId:null}, analysis:memento.analysis,
    ui:{...state.ui,...memento.ui,paneAssignmentWarning:null,activeWizard:null}, layout:memento.layout, revision:state.revision+1,
  };
}

/** Build a portable v5 snapshot from the actual live slices, never a history memento. */
export function snapshotFromWorkspace(state: WorkspaceState): WorkspaceSnapshotV5 | null {
  const { files, traces, panes, markers, lines, analysis, ui } = state;
  const paneIds = panes.panes.map(p => p.id);
  const layout = {...state.layout, paneOrder: [...state.layout.paneOrder.filter(id => paneIds.includes(id)), ...paneIds.filter(id => !state.layout.paneOrder.includes(id))], sizes: Object.fromEntries(Object.entries(state.layout.sizes).filter(([id]) => paneIds.includes(id)))};
  const body = {
    version: 4, files: files.files.map(file => ({...file, ...(files.rawFileData[String(file.id)] !== undefined ? {rawText:files.rawFileData[String(file.id)]} : {})})),
    datasets: files.files.flatMap(file => file.datasets ?? []), displayTraces: files.files.flatMap(file => file.displayTraces ?? []),
    derivedTraces: traces.derivedTraces, vis: traces.vis, panes: panes.panes, paneMode: panes.panes.length,
    activePaneId: panes.activePaneId, traceAssignments: panes.tracePaneMap, paneActiveTraceMap: panes.paneActiveTraceMap,
    xZoomState: {zoomAll:panes.zoomAll,sharedZoom:panes.sharedZoom,paneXZooms:panes.paneXZooms}, yZoomState:{paneYZooms:panes.paneYZooms},
    markers:markers.markers, refLines:lines.refLines, ui:{...ui, selectedRefLineId:lines.selectedRefLineId}, analysisOpenState:analysis.analysisOpenState,
    analysisResults: {noiseResults:analysis.noiseResults,ip3Results:analysis.ip3Results,peakResults:analysis.peakResults,bandwidthResults:analysis.bandwidthResults,rippleResults:analysis.rippleResults,rangeStatsResults:analysis.rangeStatsResults},
    savedNoise:[], savedIP3:[], selectedTraceName:ui.selectedTraceName, layout,
  };
  const snapshot = migrateWorkspaceV5(body);
  if (!snapshot) return null;
  // Legacy migration fills missing selections; live state can explicitly select none.
  const paneActiveTraceMap = { ...snapshot.paneActiveTraceMap };
  for (const paneId of paneIds) if (panes.paneActiveTraceMap[paneId] === null) paneActiveTraceMap[paneId] = null;
  return { ...snapshot, paneActiveTraceMap };
}

/** Build a complete candidate first. Invalid memberships refuse restore without mutation. */
export function workspaceFromSnapshot(current: WorkspaceState, snapshot: WorkspaceSnapshotV5, sanitizeLegacy = false): WorkspaceState | null {
  const files = snapshot.files.map(({rawText: _rawText, ...file}) => file as RawFileRecord);
  const rawFileData = Object.fromEntries(snapshot.files.flatMap(file => typeof file.rawText === 'string' ? [[String(file.id),file.rawText]] : []));
  const fileState: FileState = {...current.files, files, rawFileData, vis:{...snapshot.vis}, wizardQueue:[]};
  const traceState: TraceState = {derivedTraces:[...snapshot.derivedTraces], vis:{...snapshot.vis}};
  const view = traceView(fileState, traceState);
  const entries: PlacementTrace[] = view.allKnownTraces.map(trace => ({trace, paneIds:snapshot.traceAssignments[trace.name] ?? [], displayTrace:view.allDisplayTraces.find(display => display.id === trace.id || trace.parameters?.['displayTraceId'] === display.id)}));
  const accepted: (Omit<PlacementTrace, 'paneIds'> & {paneIds:string[]})[] = entries.map(entry => ({...entry,paneIds:[]}));
  for (const entry of entries) {
    const currentEntry = accepted.find(item => item.trace.name === entry.trace.name); if (!currentEntry) return null;
    for (const paneId of entry.paneIds) {
      if (!canPlaceMembership(currentEntry,paneId,snapshot.panes,accepted).allowed) { if (!sanitizeLegacy) return null; continue; }
      currentEntry.paneIds = [...currentEntry.paneIds,paneId];
    }
  }
  const safeAssignments = Object.fromEntries(accepted.map(entry => [entry.trace.name,[...entry.paneIds]]));
  const safeActive = Object.fromEntries(snapshot.panes.map(pane => {const selected=snapshot.paneActiveTraceMap[pane.id]; return [pane.id,selected && safeAssignments[selected]?.includes(pane.id) ? selected : null]}));
  const orderedPanes = snapshot.layout.paneOrder.map(id => snapshot.panes.find(pane => pane.id === id)).filter(pane => pane !== undefined);
  return {
    ...current, files:fileState, traces:traceState,
    panes:{...current.panes, panes:orderedPanes, tracePaneMap:safeAssignments, issuedPaneIds:orderedPanes.map(p => p.id), paneActiveTraceMap:safeActive, activePaneId:snapshot.activePaneId, zoomAll:snapshot.xZoomState.zoomAll, sharedZoom:snapshot.xZoomState.sharedZoom, paneXZooms:{...snapshot.xZoomState.paneXZooms}, paneYZooms:{...snapshot.yZoomState.paneYZooms}},
    markers:{...current.markers, markers:[...snapshot.markers], selectedMkrIdx:-1, armed:null, nextMarkerSerial:1},
    lines:{...current.lines, refLines:[...snapshot.refLines], refMode:null, selectedRefLineId:(snapshot.ui as typeof snapshot.ui & {selectedRefLineId?: number | null}).selectedRefLineId ?? null},
    analysis:{...snapshot.analysisResults, analysisOpenState:snapshot.analysisOpenState},
    ui:{...current.ui, ...snapshot.ui, selectedTraceName:snapshot.selectedTraceName, paneAssignmentWarning:null, activeWizard:null},
    layout:snapshot.layout,
  };
}

/** Plan against the reducer's current revision, after all asynchronous reads have finished. */
function openData(state: WorkspaceState, command: Extract<WorkspaceAction,{slice:'open-data'}>): WorkspaceState {
  const prepared = new Map<string, ReturnType<typeof prepareOpenInput>>();
  const oldView = traceView(state.files,state.traces);
  const oldById = new Map(oldView.allKnownTraces.map(trace => [trace.id,trace]));
  const matchingKeys = new Map<string,string>();
  const pendingWizards = command.inputs.filter(input => input.parsed?.format === 'needs-import-wizard');
  if (pendingWizards.length && !command.resolveBatchId) {
    const batch={id:command.inputs[0]?.id ?? '',inputs:command.inputs,targetPaneId:command.targetPaneId,workspace:command.workspace};
    const entries=pendingWizards.map(input => ({id:input.id,fileName:input.name,rawText:input.text,previewLines:input.parsed?.previewLines ?? [],suggestedConfig:input.parsed?.suggestedConfig,targetPaneId:command.targetPaneId,duplicateChoice:input.choice,pendingBatch:batch}));
    return {...state,files:{...state.files,wizardQueue:[...state.files.wizardQueue,...entries]},revision:state.revision+1};
  }
  if (command.workspace) {
    const work = state.files.files.length > 0 || state.traces.derivedTraces.length > 0 || state.markers.markers.length > 0 || state.lines.refLines.length > 0 || state.panes.panes.length > 1;
    if (command.workspace.choice === 'cancel') return state;
    if (work && command.workspace.choice !== 'replace') return {...state,ui:uiReducer(state.ui,{type:'SET',payload:{key:'paneAssignmentWarning',value:{message:'Opening the workspace requires a replacement decision.',paneId:null,traceName:null}}}),revision:state.revision+1};
    if (!workspaceFromSnapshot(state,command.workspace.snapshot,command.workspace.legacy)) return {...state,ui:uiReducer(state.ui,{type:'SET',payload:{key:'paneAssignmentWarning',value:{message:'Workspace has incompatible pane memberships; it was not loaded.',paneId:null,traceName:null}}}),revision:state.revision+1};
    const loaded=workspaceReducer(state,{slice:'load',snapshot:command.workspace.snapshot,legacy:command.workspace.legacy});
    const opened=openData(loaded,{...command,workspace:undefined,targetPaneId:undefined});
    if (opened.ui.paneAssignmentWarning !== loaded.ui.paneAssignmentWarning && opened.ui.paneAssignmentWarning) return {...state,ui:{...state.ui,paneAssignmentWarning:opened.ui.paneAssignmentWarning},revision:state.revision+1};
    return opened;
  }
  const descriptors: OpenData[] = command.inputs.filter(input => input.parsed?.format !== 'needs-import-wizard').map(input => {
    const prior = input.choice === 'replace' ? state.files.files.find(file => file.fileName === input.name) : undefined;
    if (input.choice === 'replace' && input.expectedFileId && String(prior?.id) !== input.expectedFileId) return {kind:'data',inputId:input.id,name:input.name,result:{ok:false,fileId:input.id,reason:'The file selected for replacement changed; choose again.'}};
    const adapted = prior?.datasets && prior.displayTraces ? adaptDisplayTracesToLegacyTraces(prior.datasets,prior.displayTraces,prior) : prior?.traces;
    const validPrior = !prior?.displayTraces || (adapted?.length === prior.displayTraces.length && new Set(adapted.map(trace=>trace.id)).size === adapted.length && new Set(adapted.map(trace=>trace.name)).size === adapted.length);
    const canonicalPrior = prior && adapted && validPrior ? {...prior,traces:adapted} : prior;
    const result = !validPrior ? {ok:false as const,reason:'The existing file has invalid projection references.'} : input.parsed ? prepareOpenInput({parsed:input.parsed,rawText:input.text,fileId:input.id,fileName:input.name,prior:canonicalPrior,priorRawText:prior ? state.files.rawFileData[String(prior.id)] : undefined,wizardConfig:input.wizardConfig,recognizedColumns:!input.wizardConfig}) : {ok:false as const,reason:input.error ?? 'Could not read this file.'};
    prepared.set(input.id,result);
    if (!result.ok) return {kind:'data',inputId:input.id,name:input.name,result:{ok:false,fileId:input.id,reason:result.reason}};
    for (const match of result.replacementMatches) matchingKeys.set(match.id,match.key);
    return {kind:'data',inputId:input.id,name:input.name,result:{ok:true,fileId:input.id,selection:result.selection,replacementMatches:result.replacementMatches}};
  });
  const fileMembers = state.files.files.map(file => {
    const known = traceView({...state.files,files:[file]}, {derivedTraces:[],vis:state.traces.vis}).allKnownTraces;
    return {id:String(file.id),name:file.fileName,members:known.map(trace => ({trace:{id:trace.id,key:matchingKeys.get(trace.id) ?? `existing:${trace.id}`},paneIds:state.panes.tracePaneMap[trace.name] ?? []}))};
  });
  const members: OpenMember[] = oldView.allKnownTraces.map(trace => ({trace:{id:trace.id,key:matchingKeys.get(trace.id) ?? `existing:${trace.id}`},paneIds:state.panes.tracePaneMap[trace.name] ?? []}));
  const tracesById = new Map(oldById);
  const displays = [...oldView.allDisplayTraces];
  for (const result of prepared.values()) if (result.ok) {
    const view = traceView({...state.files,files:[result.file]}, {derivedTraces:[],vis:state.traces.vis});
    for (const trace of view.allKnownTraces) tracesById.set(trace.id,trace);
    displays.unshift(...view.allDisplayTraces);
  }
  const paneById = new Map(state.panes.panes.map(pane => [pane.id,pane]));
  const choices = Object.fromEntries(command.inputs.map(input => [input.id,input.choice]));
  const plan = planOpenFiles(descriptors, {revision:state.revision, paneLimit:command.limit, issuedPaneIds:state.panes.issuedPaneIds, explicitPaneId:command.targetPaneId, duplicateChoices:choices,
    state:{hasWork:state.files.files.length > 0,files:fileMembers,panes:state.panes.panes,members,targetPaneId:state.panes.activePaneId},
    canPlace:(trace,pane,provisional) => {
      const actual = tracesById.get(trace.id); const target = paneById.get(pane.id);
      if (!actual || !target) return {allowed:false,reason:'The trace or target pane is no longer available.'};
      const entries: PlacementTrace[] = provisional.flatMap(member => {const item=tracesById.get(member.trace.id); return item ? [{trace:item,paneIds:member.paneIds,displayTrace:displays.find(display => display.id === item.id || item.parameters?.displayTraceId === display.id)}] : [];});
      return canPlaceMembership({trace:actual,paneIds:[],displayTrace:displays.find(display => display.id === actual.id || actual.parameters?.displayTraceId === display.id)},pane.id,[...paneById.values()],entries);
    },
    newPane:(_trace,_panes,issued) => {const source=state.panes.panes.find(pane => pane.id===state.panes.activePaneId) ?? state.panes.panes[0]; if (!source) return null; let n=1; while(issued.includes(`pane-${n}`)) n++; const pane={...source,id:`pane-${n}`,title:'',settings:{...source.settings}}; paneById.set(pane.id,pane); return pane;},
  });
  if (!plan.ok) return {...state,ui:uiReducer(state.ui,{type:'SET',payload:{key:'paneAssignmentWarning',value:{message:plan.reason,paneId:command.targetPaneId ?? state.panes.activePaneId,traceName:null}}}),revision:state.revision+1};
  const replacedTraceNames = new Set<string>();
  let files=[...state.files.files]; const raw={...state.files.rawFileData}; const memberships={...state.panes.tracePaneMap}; const panes=[...state.panes.panes]; const issued=[...state.panes.issuedPaneIds]; const errors: {fileName:string;message:string}[]=[];
  for (const step of plan.steps) {
    if (step.kind==='new-pane') {const pane=paneById.get(step.pane.id); if(pane){panes.push(pane);issued.push(pane.id);} continue;}
    if (step.kind==='error') {
      errors.push({fileName:step.name,message:step.reason});
      if (!step.replaceFileId) files.push({id:step.fileId,fileName:step.name,meta:{},traces:[],format:'unknown',error:step.reason});
      continue;
    }
    if (step.kind!=='file') continue;
    const item=prepared.get(step.inputId); if(!item?.ok) continue;
    if(step.replaceFileId){files=files.filter(file=>String(file.id)!==step.replaceFileId);delete raw[step.replaceFileId];}
    files.push({...item.file,fileName:step.name,matrixOpen:step.matrixOpen}); raw[step.fileId]=item.rawText;
    for(const entry of step.traces){const trace=tracesById.get(entry.trace.id);if(trace) { memberships[trace.name]=[...entry.paneIds]; if(entry.preserveFrom) replacedTraceNames.add(trace.name); }}
  }
  const wizardQueue = state.files.wizardQueue.filter(entry => entry.id !== command.resolveWizardId && (!command.resolveBatchId || entry.pendingBatch?.id !== command.resolveBatchId));
  const fileState={...state.files,files,rawFileData:raw,wizardQueue};
  const paneState={...state.panes,panes,issuedPaneIds:issued,tracePaneMap:memberships};
  let next=workspaceReducer(state,{slice:'transaction',actions:[{slice:'files',action:{type:'RESTORE_FILES',payload:fileState}},{slice:'panes',limit:command.limit,action:{type:'RESTORE',payload:paneState}},{slice:'panes',limit:command.limit,action:{type:'RECONCILE',payload:traceView(fileState,state.traces).allKnownTraces}}]});
  if (replacedTraceNames.size) {
    const updated = new Map(traceView(next.files,next.traces).allKnownTraces.filter(trace=>replacedTraceNames.has(trace.name)).map(trace=>[trace.name,trace]));
    next={...next,markers:{...next.markers,markers:next.markers.markers.map(marker=>{const trace=updated.get(marker.trace); if(!trace) return marker; const placement=placeMarker(trace,marker.requestedFreq ?? marker.freq); return {...marker,...placement};})}};
  }
  for(const error of errors) next=workspaceReducer(next,{slice:'files',action:{type:'REPORT_IMPORT_ERROR',payload:error}});
  return next;
}

/** The same projection is used for preview and execution. */
export function planLastPaneRemoval(state: WorkspaceState, targetPaneId: string) {
  const pane = state.panes.panes.at(-1);
  if (state.panes.panes.length <= 1 || pane?.id !== targetPaneId) return { ok: false as const, reason: 'The last pane changed; try again.' };
  const view = traceView(state.files, state.traces);
  const entries = view.allKnownTraces.map(trace => ({ trace, paneIds: state.panes.tracePaneMap[trace.name] ?? [], displayTrace: view.allDisplayTraces.find(display => display.id === trace.id || display.id === trace.parameters?.['displayTraceId']) }));
  return planPaneRemoval(state.panes.panes, entries, [targetPaneId]);
}

/** Preview line destinations using pre-removal source units and planned trace memberships. */
export function planLastPaneLines(state: WorkspaceState, targetPaneId: string, memberships: Record<string, readonly string[]>) {
  const traces = traceView(state.files, state.traces).allKnownTraces;
  const unitFor = (paneId: string, type: 'h' | 'v', map: Record<string, readonly string[]>) => {
    const members = traces.filter(trace => map[trace.name]?.includes(paneId));
    const units = members.map(trace => type === 'v' ? (trace.units.x && traceXGroup(trace) ? encodeXAxisUnit(traceXGroup(trace)!, trace.units.x) : null) : trace.units.y);
    return units.length && units[0] && units.every(unit => unit === units[0]) ? units[0] : null;
  };
  const remaining = state.panes.panes.filter(pane => pane.id !== targetPaneId).reverse();
  return state.lines.refLines.filter(line => line.paneIds.includes(targetPaneId)).map(line => {
    const axisUnit = unitFor(targetPaneId, line.type, state.panes.tracePaneMap);
    const destination = axisUnit ? remaining.find(pane => unitFor(pane.id, line.type, memberships) === axisUnit) : undefined;
    return { line, to: destination?.id ?? null, axisUnit };
  });
}

/** One reducer owns every workspace slice. Reconciliation runs inside the same transition. */
export function workspaceReducer(state: WorkspaceState, command: WorkspaceAction): WorkspaceState {
  if (command.slice === 'remove-last-pane') {
    if (state.revision !== command.expectedRevision) return state;
    const result = planLastPaneRemoval(state, command.targetPaneId);
    if (!result.ok || (result.plan.unplaced.length > 0 && !command.confirmed)) return state;
    const linePlan = planLastPaneLines(state, command.targetPaneId, result.plan.memberships);
    if (linePlan.length && !command.confirmed) return state;
    const byId = new Map(linePlan.map(item => [item.line.id, item]));
    const refLines = state.lines.refLines.map(line => {
      const move = byId.get(line.id);
      if (!move) return line;
      const remaining = line.paneIds.filter(id => id !== command.targetPaneId);
      const paneIds = remaining.length || !move.to ? remaining : [move.to];
      return { ...line, paneIds, axisUnit: move.axisUnit ?? line.axisUnit };
    });
    const prepared = { ...state, lines: { ...state.lines, refLines } };
    return workspaceReducer(prepared, { slice: 'panes', limit: command.limit, action: { type: 'SET_PANE_COUNT', payload: state.panes.panes.length - 1, limit: command.limit, confirmed: command.confirmed } });
  }
  if (command.slice === 'open-data') return openData(state,command);
  if (command.slice === 'files' && command.action.type === 'RESOLVE_WIZARD') {
    const {id,config,decisions,workspaceChoice}=command.action.payload;
    const entry=state.files.wizardQueue.find(item=>item.id===id); if(!entry) return state;
    const prior=state.files.files.find(file=>String(file.id)===entry.id);
    try {
      const parsed=parseTabularFile(entry.rawText,entry.fileName,config);
      if (entry.pendingBatch) {
        const batch={...entry.pendingBatch,workspace:entry.pendingBatch.workspace && workspaceChoice ? {...entry.pendingBatch.workspace,choice:workspaceChoice} : entry.pendingBatch.workspace,inputs:entry.pendingBatch.inputs.map(input => ({...(input.id===entry.id ? {...input,parsed,wizardConfig:config} : input),...decisions?.[input.id]}))};
        const remaining=state.files.wizardQueue.filter(item => item.pendingBatch?.id===batch.id && item.id!==entry.id);
        if (remaining.length) return {...state,files:{...state.files,wizardQueue:state.files.wizardQueue.filter(item=>item.id!==entry.id).map(item=>item.pendingBatch?.id===batch.id ? {...item,pendingBatch:batch} : item)},revision:state.revision+1};
        return openData(state,{slice:'open-data',inputs:batch.inputs,targetPaneId:batch.targetPaneId,limit:command.limit ?? 4,resolveBatchId:batch.id,workspace:batch.workspace});
      }
      return openData(state,{slice:'open-data',inputs:[{id:prior ? `${entry.id}:reimport:${state.revision}` : entry.id,name:entry.fileName,text:entry.rawText,parsed,choice:prior ? 'replace' : entry.duplicateChoice,wizardConfig:config}],targetPaneId:entry.targetPaneId,limit:command.limit ?? 4,resolveWizardId:entry.id});
    } catch(error) {
      const withoutFailedWizard = {...state, files:{...state.files, wizardQueue:state.files.wizardQueue.filter(item => item.id !== entry.id)}};
      return workspaceReducer(withoutFailedWizard,{slice:'files',action:{type:'REPORT_IMPORT_ERROR',payload:{fileName:entry.fileName,message:error instanceof Error ? error.message : String(error)}}});
    }
  }
  if (command.slice === 'files' && command.action.type === 'SKIP_WIZARD') {
    const id=command.action.payload.id; const batch=state.files.wizardQueue.find(entry=>entry.id===id)?.pendingBatch;
    if(batch) {
      const inputs=batch.inputs.filter(input=>input.id!==id);
      const wizardQueue=state.files.wizardQueue.filter(entry=>entry.id!==id).map(entry=>entry.pendingBatch?.id===batch.id ? {...entry,pendingBatch:{...batch,inputs}} : entry);
      return {...state,files:{...state.files,wizardQueue},revision:state.revision+1};
    }
  }
  if (command.slice === 'transaction') {
    const result = command.actions.reduce(workspaceReducer, state);
    return result === state ? state : {...result, revision:state.revision + 1};
  }
  if (command.slice === 'load') {
    const candidate = workspaceFromSnapshot(state,command.snapshot,command.legacy);
    if (!candidate) return {...state,ui:uiReducer(state.ui,{type:'SET',payload:{key:'paneAssignmentWarning',value:{message:'Workspace has incompatible pane memberships; it was not loaded.',paneId:null,traceName:null}}}),revision:state.revision+1};
    return workspaceReducer(state,{slice:'restore',state:candidate});
  }
  if (command.slice === 'deleteTrace') {
    const trace = traceView(state.files,state.traces).allKnownTraces.find(item => item.id === command.traceId);
    if (!trace) return state;
    if (trace.kind === 'derived') return workspaceReducer(state,{slice:'traces',action:{type:'REMOVE_DERIVED',payload:trace.id}});
    const file = state.files.files.find(item => item.traces.some(t => t.id === trace.id || t.name === trace.name) || item.displayTraces?.some(display => display.id === trace.id || display.compat?.legacyTraceName === trace.name));
    if (!file) return state;
    const display = file.displayTraces?.find(item => item.id === trace.id || item.compat?.legacyTraceName === trace.name);
    return workspaceReducer(state,{slice:'files',action:display ? {type:'DELETE_DISPLAY_TRACE',payload:{fileId:String(file.id),displayTraceId:display.id}} : {type:'DELETE_RAW_TRACE',payload:{fileId:String(file.id),traceId:trace.id}}});
  }
  if (command.slice === 'restore') return {
    ...command.state,
    panes: paneReducer(state.panes, {type: 'RESTORE', payload: command.state.panes}),
    markers: markerReducer(state.markers, {type: 'RESTORE', payload: command.state.markers}),
    ui: { ...command.state.ui, theme: state.ui.theme }, revision: state.revision + 1,
  };
  let next = state;
  switch (command.slice) {
    case 'files': next = { ...state, files: fileReducer(state.files, command.action) }; break;
    case 'traces': next = { ...state, traces: traceReducer(state.traces, command.action) }; break;
    case 'markers': next = { ...state, markers: markerReducer(state.markers, command.action) }; break;
    case 'lines': next = { ...state, lines: refLineReducer(state.lines, command.action) }; break;
    case 'analysis': next = { ...state, analysis: analysisReducer(state.analysis, command.action) }; break;
    case 'ui': next = { ...state, ui: uiReducer(state.ui, command.action) }; break;
    case 'panes': {
      let action = command.action;
      if (!['SET_PANE_COUNT','SET_RENDER_MODE','CREATE_PANE_WITH_TRACE','ASSIGN_TRACE_TO_PANE','ADD_MEMBERSHIP','MOVE_MEMBERSHIP'].includes(action.type)) {
        next = { ...state, panes: paneReducer(state.panes, action) }; break;
      }
      const view = traceView(state.files, state.traces);
      const entries = view.allKnownTraces.map(trace => ({ trace, paneIds: state.panes.tracePaneMap[trace.name] ?? [], displayTrace: view.allDisplayTraces.find(display => display.id === trace.id || display.id === trace.parameters?.['displayTraceId']) }));
      const refusal = (message: string, paneId: string | null): WorkspaceState => ({...state,ui:uiReducer(state.ui,{type:'SET',payload:{key:'paneAssignmentWarning',value:{message,paneId,traceName:null}}}),revision:state.revision+1});
      if (action.type === 'SET_PANE_COUNT' && action.payload < state.panes.panes.length && !action.confirmed) {
        const plan=planPaneRemoval(state.panes.panes,entries,state.panes.panes.slice(action.payload).map(pane => pane.id));
        if (!plan.ok || plan.plan.unplaced.length) return refusal(plan.ok ? 'Removing these panes would leave traces unplaced; confirmation is required.' : plan.reason,state.panes.activePaneId);
      }
      if (action.type === 'SET_RENDER_MODE' && !action.payload.confirmed) {
        const plan=planPaneTypeChange(state.panes.panes,entries,action.payload.paneId,action.payload.mode);
        if (!plan.ok || plan.plan.requiresConfirmation) return refusal(plan.ok ? 'Changing this pane would leave traces unplaced; confirmation is required.' : plan.reason,action.payload.paneId);
      }
      if (action.type === 'SET_PANE_COUNT') action = { ...action, limit: command.limit, traces: entries };
      else if (action.type === 'SET_RENDER_MODE') action = { ...action, payload: { ...action.payload, traces: entries } };
      if (action.type === 'CREATE_PANE_WITH_TRACE') {
        const trace = view.allKnownTraces.find(item => item.id === action.payload.trace.id && item.name === action.payload.trace.name);
        if (!trace) return state;
        next = { ...state, panes: paneReducer(state.panes, { type: 'CREATE_PANE_WITH_TRACE', limit: command.limit, payload: { trace, allTraces: view.allKnownTraces, displayTraces: view.allDisplayTraces } }) };
      }
      else if (action.type === 'ASSIGN_TRACE_TO_PANE') next = { ...state, panes: paneReducer(state.panes, { type: 'ASSIGN_TRACE_TO_PANE', payload: { ...action.payload, allTraces: view.allKnownTraces, displayTraces: view.allDisplayTraces } }) };
      else if (action.type === 'ADD_MEMBERSHIP') next = { ...state, panes: paneReducer(state.panes, { type: 'ADD_MEMBERSHIP', payload: { ...action.payload, allTraces: view.allKnownTraces, displayTraces: view.allDisplayTraces } }) };
      else if (action.type === 'MOVE_MEMBERSHIP') next = { ...state, panes: paneReducer(state.panes, { type: 'MOVE_MEMBERSHIP', payload: { ...action.payload, allTraces: view.allKnownTraces, displayTraces: view.allDisplayTraces } }) };
      else next = { ...state, panes: paneReducer(state.panes, action) };
      break;
    }
  }
  if (next.files === state.files && next.traces === state.traces && next.panes === state.panes && next.markers === state.markers && next.lines === state.lines && next.analysis === state.analysis && next.ui === state.ui) return state;
  if (next.files !== state.files || next.traces !== state.traces) {
    const view = traceView(next.files, next.traces);
    const raw = view.allKnownTraces.filter(trace => trace.kind !== 'derived');
    const reconciled = traceReducer(next.traces, { type: 'RECONCILE', payload: raw });
    const vis = { ...reconciled.vis }; let changed = false;
    for (const trace of view.allTraces) if (vis[trace.name] === undefined) { vis[trace.name] = true; changed = true; }
    next = { ...next, traces: changed ? { ...reconciled, vis } : reconciled };
    const known = traceView(next.files, next.traces).allKnownTraces;
    const knownNames = new Set(known.map(trace => trace.name));
    const removed = traceView(state.files, state.traces).allKnownTraces.filter(trace => !knownNames.has(trace.name)).map(trace => trace.name);
    if (removed.length) {
      const visibility = { ...next.traces.vis }; for (const name of removed) delete visibility[name];
      next = { ...next, traces: { ...next.traces, vis: visibility }, markers: markerReducer(next.markers, { type: 'REMOVE_MARKERS_FOR_TRACES', payload: removed }), ui: {...next.ui, selectedTraceName: next.ui.selectedTraceName && removed.includes(next.ui.selectedTraceName) ? null : next.ui.selectedTraceName, markerTrace: removed.includes(next.ui.markerTrace) ? '__auto__' : next.ui.markerTrace} };
    }
    next = { ...next, panes: paneReducer(next.panes, { type: 'RECONCILE', payload: known }) };
    const visible = traceView(next.files,next.traces).allTraces;
    if (!next.ui.selectedTraceName || !visible.some(trace => trace.name === next.ui.selectedTraceName && next.traces.vis[trace.name])) { const first=visible.find(trace => next.traces.vis[trace.name]); next={...next,ui:{...next.ui,selectedTraceName:first?.name ?? null}}; }
  }
  if (next.panes.panes !== state.panes.panes) next = { ...next, lines: refLineReducer(next.lines, { type: 'CLEANUP_ORPHANED_LINES', payload: { paneIds: next.panes.panes.map(p => p.id) } }) };
  return { ...next, revision: state.revision + 1 };
}

export interface WorkspaceEngine {
  readonly present: WorkspaceState; readonly history: TransactionHistory<WorkspaceMemento>;
  readonly gesture: WorkspaceMemento | null; readonly historyNotice: 'oversized' | 'pruned' | null; readonly toastMessage?: string;
}
export type WorkspaceEngineAction = {type:'change';command:WorkspaceAction;record?:boolean;toastMessage?:string;toastKind?:ToastKind} | {type:'undo'|'redo'|'begin-gesture'|'commit-gesture'|'cancel-gesture'|'clear-notice'};
export function initialWorkspaceEngine(): WorkspaceEngine { return {present:initialWorkspaceState(),history:createTransactionHistory<WorkspaceMemento>(),gesture:null,historyNotice:null}; }

/** Recursive comparison short-circuits structurally shared samples and handles no-op wrapper copies. */
function sameValue(a: unknown, b: unknown, seen = new WeakMap<object, object>()): boolean {
  if (Object.is(a,b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  if (seen.has(a)) return seen.get(a) === b;
  seen.set(a,b);
  const keysA = Object.keys(a); const keysB = Object.keys(b);
  return keysA.length === keysB.length && keysA.every(key => Object.prototype.hasOwnProperty.call(b,key) && sameValue((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key],seen));
}
function recordable(command: WorkspaceAction): boolean {
  if (command.slice === 'remove-last-pane' || command.slice === 'open-data' || command.slice === 'transaction' || command.slice === 'restore' || command.slice === 'deleteTrace' || command.slice === 'load') return true;
  if (command.slice === 'files') return true;
  if (command.slice === 'traces') return command.action.type !== 'RECONCILE';
  if (command.slice === 'panes') return command.action.type !== 'RECONCILE';
  if (command.slice === 'markers') return !['ARM','SET_TRACE','SET_SELECTED_IDX'].includes(command.action.type);
  if (command.slice === 'lines') return !['SET_MODE','SET_SELECTED','SET_HOVERED','SET_PANE_VIEW','CLEANUP_ORPHANED_LINES'].includes(command.action.type);
  if (command.slice === 'analysis') return true;
  if (command.slice === 'ui') return command.action.type === 'SET' && ['traceColors','traceInterpolations','noiseFilter','noiseSource','ip3Gain','selectedTraceName'].includes(command.action.payload.key);
  return false;
}
export function workspaceEngineReducer(engine: WorkspaceEngine, action: WorkspaceEngineAction): WorkspaceEngine {
  if (action.type === 'clear-notice') return {...engine,historyNotice:null,toastMessage:undefined};
  if (action.type === 'begin-gesture') return engine.gesture ? engine : {...engine,gesture:captureWorkspace(engine.present)};
  if (action.type === 'cancel-gesture') return engine.gesture ? {...engine,present:restoreWorkspaceMemento(engine.present,engine.gesture),gesture:null} : engine;
  if (action.type === 'commit-gesture') {
    if (!engine.gesture) return engine;
    const result = recordTransaction(engine.history,engine.gesture,captureWorkspace(engine.present),sameValue);
    // A new action normally clears redo; only past entries were evicted by the limit.
    return {...engine,gesture:null,history:result.history,historyNotice:result.outcome === 'oversized' ? 'oversized' : result.prunedPast ? 'pruned' : null};
  }
  if (action.type === 'undo' || action.type === 'redo') {
    const current = engine.gesture ? restoreWorkspaceMemento(engine.present,engine.gesture) : engine.present;
    const moved = action.type === 'undo' ? undoTransaction(engine.history,captureWorkspace(current)) : redoTransaction(engine.history,captureWorkspace(current));
    return {...engine,present:moved.state ? restoreWorkspaceMemento(current,moved.state) : current,history:moved.history,gesture:null,historyNotice:moved.outcome === 'moved-pruned' ? 'pruned' : null};
  }
  if (action.type !== 'change') return engine;
  const next = workspaceReducer(engine.present,action.command);
  if (next === engine.present) return engine;
  if (engine.gesture || !(action.record ?? recordable(action.command))) return {...engine,present:next};
  const result = recordTransaction(engine.history,captureWorkspace(engine.present),captureWorkspace(next),sameValue);
  // A toast is raised only for the kinds in the toast policy; any other change stays silent.
  let toastMessage = action.toastKind ? action.toastMessage : undefined;
  if (action.command.slice === 'open-data') {
    const ids = new Set(action.command.inputs.map(input => input.id));
    const opened = next.files.files.filter(file => ids.has(String(file.id)) && !file.error).length;
    const failed = Math.max(0,next.files.importErrors.length - engine.present.files.importErrors.length);
    toastMessage = opened || failed || action.command.workspace ? [action.command.workspace ? 'Opened workspace' : '', opened ? `Opened ${opened} file${opened === 1 ? '' : 's'}` : '', failed ? `${failed} failed` : ''].filter(Boolean).join(' - ') : undefined;
  }
  return {present:next,history:result.history,gesture:null,historyNotice:result.outcome === 'oversized' ? 'oversized' : result.prunedPast ? 'pruned' : null,toastMessage:result.outcome === 'noop' ? undefined : toastMessage};
}

const WorkspaceContext = createContext<{ state: WorkspaceState; dispatch: React.Dispatch<WorkspaceAction>; history: TransactionHistory<WorkspaceMemento>; historyNotice: WorkspaceEngine['historyNotice']; historyDispatch: React.Dispatch<WorkspaceEngineAction> } | null>(null);
export function useOptionalAggregateWorkspace() { return useContext(WorkspaceContext); }
export function useAggregateWorkspace() { const value = useContext(WorkspaceContext); if (!value) throw new Error('Missing workspace provider'); return value; }

export function AggregateWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [engine, historyDispatch] = useReducer(workspaceEngineReducer, undefined, initialWorkspaceEngine);
  const show = useOptionalToast()?.show;
  useEffect(() => {
    if ((!engine.historyNotice && !engine.toastMessage) || !show) return;
    // History notices (pruned, too large) never raise a toast: the oldest step is dropped silently.
    if (!engine.toastMessage) { historyDispatch({type:'clear-notice'}); return; }
    show({message:engine.toastMessage, ...(engine.historyNotice !== 'oversized' ? {undo:() => historyDispatch({type:'undo'})} : {})});
    historyDispatch({type:'clear-notice'});
  }, [engine.historyNotice, engine.toastMessage, show]);
  const state = engine.present;
  const dispatch = useCallback<React.Dispatch<WorkspaceAction>>(command => historyDispatch({type:'change',command}),[]);
  const [limit, setLimit] = useState<4 | 8>(() => { try { return localStorage.getItem('mergen-experimental-eight-panes') === 'true' ? 8 : 4; } catch { return 4; } });
  const setExperimental = useCallback((enabled: boolean) => { setLimit(enabled ? 8 : 4); try { if (enabled) localStorage.setItem('mergen-experimental-eight-panes', 'true'); else localStorage.removeItem('mergen-experimental-eight-panes'); } catch { /* storage unavailable */ } }, []);
  const fileDispatch = useCallback<React.Dispatch<FileAction>>(action => dispatch({ slice: 'files', action, limit }), [limit]);
  const traceDispatch = useCallback<React.Dispatch<TraceAction>>(action => dispatch({ slice: 'traces', action }), []);
  const paneDispatch = useCallback<React.Dispatch<PaneAction>>(action => dispatch({ slice: 'panes', action, limit }), [limit]);
  const markerDispatch = useCallback<React.Dispatch<MarkerAction>>(action => dispatch({ slice: 'markers', action }), []);
  const lineDispatch = useCallback<React.Dispatch<RefLineAction>>(action => dispatch({ slice: 'lines', action }), []);
  const analysisDispatch = useCallback<React.Dispatch<AnalysisAction>>(action => dispatch({ slice: 'analysis', action }), []);
  const uiDispatch = useCallback<React.Dispatch<UiAction>>(action => dispatch({ slice: 'ui', action }), []);
  const view = useMemo(() => traceView(state.files, state.traces), [state.files, state.traces]);
  return <WorkspaceContext.Provider value={{state, dispatch, history:engine.history, historyNotice:engine.historyNotice, historyDispatch}}><UiStoreAdapter state={state.ui} dispatch={uiDispatch}>
    <AnalysisDispatchContext.Provider value={analysisDispatch}><AnalysisStateContext.Provider value={state.analysis}>
    <MarkerDispatchContext.Provider value={markerDispatch}><MarkerStateContext.Provider value={state.markers}>
    <RefLineDispatchContext.Provider value={lineDispatch}><RefLineStateContext.Provider value={state.lines}>
    <FileDispatchContext.Provider value={fileDispatch}><FileStateContext.Provider value={state.files}>
    <TraceDispatchContext.Provider value={traceDispatch}><TraceStateContext.Provider value={view}>
    <PaneLimitContext.Provider value={{limit, setExperimental}}><PaneDispatchContext.Provider value={paneDispatch}><PaneStateContext.Provider value={state.panes}>
      {children}
    </PaneStateContext.Provider></PaneDispatchContext.Provider></PaneLimitContext.Provider>
    </TraceStateContext.Provider></TraceDispatchContext.Provider></FileStateContext.Provider></FileDispatchContext.Provider>
    </RefLineStateContext.Provider></RefLineDispatchContext.Provider></MarkerStateContext.Provider></MarkerDispatchContext.Provider>
    </AnalysisStateContext.Provider></AnalysisDispatchContext.Provider>
  </UiStoreAdapter></WorkspaceContext.Provider>;
}

