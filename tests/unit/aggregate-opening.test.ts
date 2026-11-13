import {expect,it} from 'vitest';
import {parseTabularFile} from '../../src/domain/parsers/tabular';
import {initialWorkspaceEngine,traceView,workspaceEngineReducer,snapshotFromWorkspace} from '../../src/stores/aggregate-workspace-store';
const cfg={delimiter:',',skipRows:1,xCol:0,yCols:[1,2,3],xMult:1,yMult:1,domain:'time' as const,confidence:1,headers:['time','a','b','c']};
it('opens and replaces a source atomically while preserving matching IDs and memberships',()=>{
 let e=initialWorkspaceEngine(); const text='time,a,b,c\n0,1,2,3\n1,2,3,4';
 e=workspaceEngineReducer(e,{type:'change',command:{slice:'open-data',inputs:[{id:'one',name:'a.csv',text,parsed:parseTabularFile(text,'a.csv',cfg)}],limit:4}});
 const old=traceView(e.present.files,e.present.traces).allKnownTraces; expect(old).toHaveLength(3); expect(e.present.panes.tracePaneMap[old[0]!.name]).toEqual(['pane-1']);
 e=workspaceEngineReducer(e,{type:'change',command:{slice:'markers',action:{type:'PLACE_MARKER',payload:{trace:old[0]!,targetFreq:0}}}});
 const markerId=e.present.markers.markers[0]?.id;
 const newText='time,a,b,c\n0,10,20,30\n1,20,30,40';
 e=workspaceEngineReducer(e,{type:'change',command:{slice:'open-data',inputs:[{id:'two',name:'a.csv',text:newText,parsed:parseTabularFile(newText,'a.csv',cfg),choice:'replace'}],limit:4}});
 const replaced=traceView(e.present.files,e.present.traces).allKnownTraces; expect(replaced.map(t=>t.id)).toEqual(old.map(t=>t.id)); expect(e.present.files.files).toHaveLength(1);
 expect(e.present.panes.tracePaneMap[old[0]!.name]).toEqual(['pane-1']);
 expect(e.present.markers.markers[0]).toMatchObject({id:markerId,freq:0,amp:10});
 e=workspaceEngineReducer(e,{type:'undo'}); expect(e.present.files.rawFileData.one).toBe(text);
});

it('opens duplicate source headers distinctly and refuses ambiguous replacement',()=>{
 const text='time,a,a\n0,1,2\n1,2,3'; const conf={...cfg,yCols:[1,2],headers:['time','old','labels']};
 let e=initialWorkspaceEngine();
 e=workspaceEngineReducer(e,{type:'change',command:{slice:'open-data',inputs:[{id:'one',name:'a.csv',text,parsed:parseTabularFile(text,'a.csv',conf)}],limit:4}});
 const old=traceView(e.present.files,e.present.traces).allKnownTraces; expect(old).toHaveLength(2); expect(new Set(old.map(trace=>trace.id)).size).toBe(2);
 e=workspaceEngineReducer(e,{type:'change',command:{slice:'open-data',inputs:[{id:'two',name:'a.csv',text,parsed:parseTabularFile(text,'a.csv',conf),choice:'replace'}],limit:4}});
 expect(e.present.files.files[0]?.id).toBe('one');
});
it('uses actual changed source headers even when wizard labels are stale',()=>{
 const original='time,a,b,c\n0,1,2,3\n1,2,3,4'; const changed='time,a,changed,c\n0,4,5,6\n1,7,8,9';
 let e=initialWorkspaceEngine(); e=workspaceEngineReducer(e,{type:'change',command:{slice:'open-data',inputs:[{id:'one',name:'a.csv',text:original,parsed:parseTabularFile(original,'a.csv',cfg)}],limit:4}});
 const old=traceView(e.present.files,e.present.traces).allKnownTraces;
 e=workspaceEngineReducer(e,{type:'change',command:{slice:'open-data',inputs:[{id:'two',name:'a.csv',text:changed,parsed:parseTabularFile(changed,'a.csv',cfg),choice:'replace'}],limit:4}});
 const next=traceView(e.present.files,e.present.traces).allKnownTraces;
 expect(next[0]?.id).toBe(old[0]?.id); expect(next[1]?.id).not.toBe(old[1]?.id); expect(next[2]?.id).toBe(old[2]?.id);
});

it('preserves an intentionally empty membership when replacing a column',()=>{
 const text='time,a,b,c\n0,1,2,3\n1,2,3,4'; let e=initialWorkspaceEngine();
 e=workspaceEngineReducer(e,{type:'change',command:{slice:'open-data',inputs:[{id:'one',name:'a.csv',text,parsed:parseTabularFile(text,'a.csv',cfg)}],limit:4}});
 const old=traceView(e.present.files,e.present.traces).allKnownTraces[0]!;
 e=workspaceEngineReducer(e,{type:'change',command:{slice:'panes',action:{type:'REMOVE_MEMBERSHIP',payload:{traceName:old.name,paneId:'pane-1'}}}});
 expect(e.present.panes.tracePaneMap[old.name]).toEqual([]);
 const changed='time,a,b,c\n0,10,20,30\n1,20,30,40';
 e=workspaceEngineReducer(e,{type:'change',command:{slice:'open-data',inputs:[{id:'two',name:'a.csv',text:changed,parsed:parseTabularFile(changed,'a.csv',cfg),choice:'replace'}],limit:4}});
 const replaced=traceView(e.present.files,e.present.traces).allKnownTraces.find(trace=>trace.id===old.id)!;
 expect(e.present.panes.tracePaneMap[replaced.name]).toEqual([]);
 expect(e.present.panes.panes).toHaveLength(1);
});

it('keeps failed new-file rows and counts errors while a failed replacement keeps its prior file',()=>{
 const original='time,a,b,c\n0,1,2,3\n1,2,3,4'; let e=initialWorkspaceEngine();
 e=workspaceEngineReducer(e,{type:'change',command:{slice:'open-data',inputs:[{id:'old',name:'same.csv',text:original,parsed:parseTabularFile(original,'same.csv',cfg)}],limit:4}});
 const prior=e.present.files.files[0];
 e=workspaceEngineReducer(e,{type:'change',toastMessage:'opening',command:{slice:'open-data',inputs:[
  {id:'failed-copy',name:'new.csv',text:'',error:'Could not read this file.'},
  {id:'failed-replace',name:'same.csv',text:'',error:'Could not read this file.',choice:'replace',expectedFileId:String(prior!.id)},
 ],limit:4}});
 expect(e.present.files.files.find(file=>file.fileName==='same.csv')?.id).toBe(prior?.id);
 expect(e.present.files.files.find(file=>file.fileName==='new.csv')).toMatchObject({error:'Could not read this file.'});
 expect(e.present.files.importErrors).toHaveLength(2);
 expect(e.toastMessage).toContain('2 failed');
});

it('waits for every wizard and opens the entire batch in one undoable transition',()=>{
 const raw='x,y\n0,1\n1,2'; const wizard={format:'needs-import-wizard',meta:{},traces:[],previewLines:['x,y','0,1','1,2']};
 const one={id:'w1',name:'one.csv',text:raw,parsed:wizard}; const two={id:'w2',name:'two.csv',text:raw,parsed:wizard};
 const config={...cfg,yCols:[1],headers:['x','y']}; let e=initialWorkspaceEngine();
 e=workspaceEngineReducer(e,{type:'change',command:{slice:'open-data',inputs:[one,two],limit:4}});
 expect(e.present.files.files).toHaveLength(0); expect(e.present.files.wizardQueue).toHaveLength(2); expect(e.history.past).toHaveLength(0);
 e=workspaceEngineReducer(e,{type:'change',command:{slice:'files',action:{type:'RESOLVE_WIZARD',payload:{id:'w1',config}},limit:4}});
 expect(e.present.files.files).toHaveLength(0); expect(e.present.files.wizardQueue).toHaveLength(1); expect(e.history.past).toHaveLength(0);
 e=workspaceEngineReducer(e,{type:'change',command:{slice:'files',action:{type:'RESOLVE_WIZARD',payload:{id:'w2',config}},limit:4}});
 expect(e.present.files.files).toHaveLength(2); expect(e.present.files.wizardQueue).toHaveLength(0); expect(e.history.past).toHaveLength(1);
 e=workspaceEngineReducer(e,{type:'undo'}); expect(e.present.files.files).toHaveLength(0); expect(e.present.files.wizardQueue).toHaveLength(0);
});
it('cancels a pending wizard batch without a history entry',()=>{
 const wizard={format:'needs-import-wizard',meta:{},traces:[],previewLines:[]}; let e=initialWorkspaceEngine();
 e=workspaceEngineReducer(e,{type:'change',command:{slice:'open-data',inputs:[{id:'w',name:'w.csv',text:'x',parsed:wizard}],limit:4}});
 e=workspaceEngineReducer(e,{type:'change',command:{slice:'files',action:{type:'SKIP_WIZARD',payload:{id:'w'}}}});
 expect(e.present.files.wizardQueue).toHaveLength(0); expect(e.history.past).toHaveLength(0);
});

it('opens a workspace before data in one action and undo restores the previous workspace',()=>{
 const old='time,a,b,c\n0,1,2,3\n1,2,3,4'; let e=initialWorkspaceEngine();
 e=workspaceEngineReducer(e,{type:'change',command:{slice:'open-data',inputs:[{id:'old',name:'old.csv',text:old,parsed:parseTabularFile(old,'old.csv',cfg)}],limit:4}});
 const empty=snapshotFromWorkspace(initialWorkspaceEngine().present); if(!empty) throw Error('snapshot');
 const next='time,a,b,c\n0,4,5,6\n1,7,8,9';
 e=workspaceEngineReducer(e,{type:'change',command:{slice:'open-data',workspace:{snapshot:empty,legacy:false,choice:'replace'},inputs:[{id:'new',name:'new.csv',text:next,parsed:parseTabularFile(next,'new.csv',cfg)}],targetPaneId:'stale-pane',limit:4}});
 expect(e.present.files.files.map(file=>file.fileName)).toEqual(['new.csv']);
 e=workspaceEngineReducer(e,{type:'undo'}); expect(e.present.files.files.map(file=>file.fileName)).toEqual(['old.csv']);
});
