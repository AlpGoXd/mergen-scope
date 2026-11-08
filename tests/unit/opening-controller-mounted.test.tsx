import React from 'react';
import { act, renderHook, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { StoreRoot } from '../../src/stores/StoreRoot';
import { useFileImport } from '../../src/hooks/use-file-import';
import { initialWorkspaceEngine, snapshotFromWorkspace, useAggregateWorkspace } from '../../src/stores/aggregate-workspace-store';
import { usePaneDispatch, usePaneLimit, usePaneState } from '../../src/stores/pane-store';
import { useFileDispatch, useFileState } from '../../src/stores/file-store';
import { useTraceDispatch, useTraceState } from '../../src/stores/trace-store';
import { useMarkerDispatch, useMarkerState } from '../../src/stores/marker-store';
import { useUiDispatch, useUiState } from '../../src/stores/ui-store';
import { makeTestTrace } from './helpers';

vi.mock('../../src/components/shared/PretextLabel', () => ({ PretextLabel: ({text}:{text:string}) => text }));

const csv = 'Time,CH1\n0,1\n1,2\n';
const changedCsv = 'Time,CH1\n0,3\n1,4\n';
function delayedFile(name: string) {
  let resolve!: (text: string) => void;
  const text = new Promise<string>(r => { resolve = r; });
  return { file: {name, text: () => text} as File, resolve };
}
function harness() {
  return { open:useFileImport(), workspace:useAggregateWorkspace(), panes:usePaneState(), pane:usePaneDispatch(), limit:usePaneLimit(), files:useFileState(), file:useFileDispatch(), traces:useTraceState(), traceDispatch:useTraceDispatch(), markers:useMarkerState(), marker:useMarkerDispatch(), ui:useUiState(), setUi:useUiDispatch() };
}
const wrapper = ({children}:{children:React.ReactNode}) => <StoreRoot>{children}</StoreRoot>;
beforeEach(() => { const values = new Map<string,string>(); vi.stubGlobal('localStorage', {getItem:(key:string)=>values.get(key) ?? null, setItem:(key:string,value:string)=>values.set(key,value), removeItem:(key:string)=>values.delete(key)}); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('mounted opening controller', () => {
  it('uses current memberships after a delayed read and refuses an incompatible explicit target', async () => {
    const {result} = renderHook(harness, {wrapper});
    const hz=makeTestTrace({id:'hz',name:'hz',units:{x:'Hz',y:'dB'}});
    act(() => result.current.file({type:'ADD_PARSED_FILE',payload:{id:'existing',fileName:'existing.dat',text:'original',parsed:{format:'rs-dat',meta:{},traces:[hz]}}}));
    const pending=delayedFile('new.csv'); let opening!:Promise<void>;
    act(() => { opening=result.current.open([pending.file], 'pane-1'); });
    act(() => result.current.pane({type:'ADD_MEMBERSHIP',payload:{trace:hz,targetPaneId:'pane-1',allTraces:[hz]}}));
    await act(async () => { pending.resolve(csv); await opening; });
    expect(result.current.files.files.map(f=>f.fileName)).toEqual(['existing.dat']);
    expect(result.current.panes.tracePaneMap.hz).toEqual(['pane-1']);
    expect(result.current.files.rawFileData.existing).toBe('original');
  });

  it('uses the latest active pane and preserves an intervening undo after a delayed read', async () => {
    const {result}=renderHook(harness,{wrapper});
    act(() => result.current.pane({type:'SET_PANE_COUNT',payload:2}));
    const pending=delayedFile('new.csv'); let opening!:Promise<void>;
    act(() => { opening=result.current.open([pending.file]); });
    act(() => result.current.pane({type:'SET_ACTIVE_PANE',payload:'pane-2'}));
    act(() => result.current.workspace.historyDispatch({type:'undo'}));
    await act(async () => {pending.resolve(csv); await opening;});
    expect(result.current.panes.panes.map(p=>p.id)).toEqual(['pane-1','pane-2']);
    expect(result.current.panes.activePaneId).toBe('pane-1');
    const trace=result.current.traces.allKnownTraces[0]; expect(trace).toBeDefined();
    expect(result.current.panes.tracePaneMap[trace!.name]).toEqual(['pane-1']);
  });

  it('uses the current pane limit after a delayed read', async () => {
    const {result}=renderHook(harness,{wrapper});
    const hz=makeTestTrace({id:'hz',name:'hz',units:{x:'Hz',y:'dB'}});
    act(() => result.current.file({type:'ADD_PARSED_FILE',payload:{id:'existing',fileName:'existing.dat',text:'original',parsed:{format:'rs-dat',meta:{},traces:[hz]}}}));
    act(() => result.current.pane({type:'SET_PANE_COUNT',payload:4}));
    for (const pane of result.current.panes.panes) act(() => result.current.pane({type:'ADD_MEMBERSHIP',payload:{trace:hz,targetPaneId:pane.id,allTraces:[hz]}}));
    const pending=delayedFile('new.csv'); let opening!:Promise<void>;
    act(() => { opening=result.current.open([pending.file]); });
    act(() => result.current.limit.setExperimental(true));
    await act(async () => {pending.resolve(csv); await opening;});
    expect(result.current.panes.panes).toHaveLength(5);
    const trace=result.current.traces.allKnownTraces.find(t=>t.name!==hz.name); expect(trace).toBeDefined();
    expect(result.current.panes.tracePaneMap[trace!.name]).toEqual([result.current.panes.panes[4]!.id]);
  });

  it('undoes the complete open after App effects settle', async () => {
    const appWrapper = ({children}:{children:React.ReactNode}) => <StoreRoot><App />{children}</StoreRoot>;
    const {result}=renderHook(harness,{wrapper:appWrapper});
    const pending=delayedFile('app.csv'); let opening!:Promise<void>;
    act(()=>{opening=result.current.open([pending.file]);});
    await act(async()=>{pending.resolve(csv); await opening;});
    expect(result.current.files.files).toHaveLength(1);
    act(()=>result.current.workspace.historyDispatch({type:'undo'}));
    expect(result.current.files.files).toHaveLength(0);
  });

  it('preserves replacement identity and workspace state through undo and redo', async () => {
    vi.spyOn(window,'prompt').mockReturnValue('replace');
    const {result}=renderHook(harness,{wrapper});
    const first=delayedFile('same.csv'); let opening!:Promise<void>;
    act(() => {opening=result.current.open([first.file]);});
    await act(async()=>{first.resolve(csv); await opening;});
    const trace=result.current.traces.allKnownTraces[0]; const file=result.current.files.files[0];
    expect(trace).toBeDefined(); expect(file).toBeDefined();
    act(()=>result.current.pane({type:'SET_PANE_COUNT',payload:2}));
    act(()=>result.current.pane({type:'ADD_MEMBERSHIP',payload:{trace:trace!,targetPaneId:'pane-2',allTraces:[trace!]}}));
    act(()=>result.current.marker({type:'PLACE_MARKER',payload:{trace:trace!,targetFreq:0}}));
    act(()=>result.current.setUi({type:'SET',payload:{key:'traceColors',value:{[trace!.name]:'#123456'}}}));
    act(()=>result.current.traceDispatch({type:'SET_VISIBILITY',name:trace!.name,visible:false}));
    const beforeMembership=result.current.panes.tracePaneMap[trace!.name]; const markerId=result.current.markers.markers[0]!.id;
    const second=delayedFile('same.csv'); act(()=>{opening=result.current.open([second.file]);});
    await act(async()=>{second.resolve(changedCsv); await opening;});
    expect(result.current.traces.allKnownTraces[0]?.id).toBe(trace!.id);
    expect(result.current.panes.tracePaneMap[trace!.name]).toEqual(beforeMembership);
    expect(result.current.markers.markers[0]?.id).toBe(markerId);
    expect(result.current.ui.traceColors[trace!.name]).toBe('#123456');
    expect(result.current.traces.vis[trace!.name]).toBe(false);
    expect(Object.values(result.current.files.rawFileData)).toContain(changedCsv);
    act(()=>result.current.workspace.historyDispatch({type:'undo'}));
    expect(Object.values(result.current.files.rawFileData)).toContain(csv);
    expect(result.current.markers.markers[0]?.id).toBe(markerId);
    act(()=>result.current.workspace.historyDispatch({type:'redo'}));
    expect(Object.values(result.current.files.rawFileData)).toContain(changedCsv);
    expect(result.current.panes.tracePaneMap[trace!.name]).toEqual(beforeMembership);
  });
  it('asks for a duplicate introduced while a wizard is pending', async () => {
    const appWrapper = ({children}:{children:React.ReactNode}) => <StoreRoot><App />{children}</StoreRoot>;
    const {result}=renderHook(harness,{wrapper:appWrapper});
    const pending=delayedFile('same.csv'); let opening!:Promise<void>;
    act(()=>{opening=result.current.open([pending.file]);});
    await act(async()=>{pending.resolve('x,y\n0,1\n1,2'); await opening;});
    expect(result.current.files.wizardQueue).toHaveLength(1);
    const trace=makeTestTrace({id:'other',name:'other'});
    act(()=>result.current.file({type:'ADD_PARSED_FILE',payload:{id:'other-file',fileName:'same.csv',text:'other',parsed:{format:'rs-dat',meta:{},traces:[trace]}}}));
    const prompt=vi.spyOn(window,'prompt').mockReturnValue('copy');
    fireEvent.click(screen.getByRole('button',{name:'Confirm'}));
    expect(prompt).toHaveBeenCalledOnce();
    expect(result.current.files.files.map(file=>file.fileName)).toEqual(['same.csv','same.csv (2)']);
  });

  it('rechecks workspace replacement at the final wizard confirmation', () => {
    const appWrapper = ({children}:{children:React.ReactNode}) => <StoreRoot><App />{children}</StoreRoot>;
    const {result}=renderHook(harness,{wrapper:appWrapper});
    const empty=snapshotFromWorkspace(initialWorkspaceEngine().present); if(!empty) throw Error('snapshot');
    const wizard={format:'needs-import-wizard',meta:{},traces:[],previewLines:['x,y','0,1','1,2']};
    act(()=>result.current.workspace.historyDispatch({type:'change',command:{slice:'open-data',workspace:{snapshot:empty,legacy:false,choice:'replace'},inputs:[{id:'pending',name:'pending.csv',text:'x,y\n0,1\n1,2',parsed:wizard}],limit:4}}));
    const trace=makeTestTrace({id:'intervening',name:'intervening'});
    act(()=>result.current.file({type:'ADD_PARSED_FILE',payload:{id:'intervening-file',fileName:'intervening.dat',text:'other',parsed:{format:'rs-dat',meta:{},traces:[trace]}}}));
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button',{name:'Confirm'}));
    expect(confirm).toHaveBeenCalledOnce();
    expect(result.current.files.wizardQueue).toHaveLength(1);
    expect(result.current.files.files.map(file=>file.fileName)).toEqual(['intervening.dat']);
  });

});



