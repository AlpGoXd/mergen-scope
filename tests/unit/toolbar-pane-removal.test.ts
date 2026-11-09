import { expect, it } from 'vitest';
import { initialWorkspaceEngine, workspaceEngineReducer, workspaceReducer, planLastPaneRemoval } from '../../src/stores/aggregate-workspace-store';
import { makeTestTrace } from './helpers';

it('binds removal to the current target and revision, and restores trace data through undo and redo', () => {
  const trace = makeTestTrace({name:'one', id:'one'});
  let engine = initialWorkspaceEngine();
  const change = (command: Parameters<typeof workspaceReducer>[1]) => { engine = workspaceEngineReducer(engine, {type:'change', command}); };
  change({slice:'files', action:{type:'ADD_PARSED_FILE',payload:{id:'f',fileName:'one.dat',text:'source',parsed:{format:'rs-dat',meta:{},traces:[trace]}}}});
  change({slice:'panes',limit:4,action:{type:'SET_PANE_COUNT',payload:2}});
  change({slice:'panes',limit:4,action:{type:'ASSIGN_TRACE_TO_PANE',payload:{trace,targetPaneId:'pane-1',allTraces:[trace]}}});
  change({slice:'panes',limit:4,action:{type:'MOVE_MEMBERSHIP',payload:{trace,fromPaneId:'pane-1',targetPaneId:'pane-2',allTraces:[trace]}}});
  change({slice:'markers',action:{type:'PLACE_MARKER',payload:{trace,targetFreq:5}}});
  const prior = engine.present;
  const command = {slice:'remove-last-pane' as const,targetPaneId:'pane-2',expectedRevision:prior.revision,confirmed:false,limit:4 as const};
  expect(planLastPaneRemoval(prior,'pane-2').ok).toBe(true);
  expect(workspaceReducer(prior,{...command,targetPaneId:'pane-1'})).toBe(prior);
  expect(workspaceReducer(prior,{...command,expectedRevision:prior.revision-1,confirmed:true})).toBe(prior);
  change(command);
  expect(engine.present.panes.panes).toHaveLength(1);
  expect(engine.present.panes.tracePaneMap.one).toEqual(['pane-1']);
  expect(engine.present.markers.markers).toHaveLength(1);
  expect(engine.present.files.files).toHaveLength(1);
  engine = workspaceEngineReducer(engine,{type:'undo'});
  expect(engine.present.panes.tracePaneMap.one).toEqual(['pane-2']);
  engine = workspaceEngineReducer(engine,{type:'redo'});
  expect(engine.present.panes.tracePaneMap.one).toEqual(['pane-1']);
  expect(workspaceReducer(engine.present,command)).toBe(engine.present);
});

it('requires confirmation for an incompatible trace and preserves its file and marker', () => {
  const freq = makeTestTrace({name:'freq',id:'freq'});
  const time = makeTestTrace({name:'time',id:'time',domain:'time',family:'waveform',units:{x:'s',y:'V'}});
  let state = initialWorkspaceEngine().present;
  state = workspaceReducer(state,{slice:'files',action:{type:'ADD_PARSED_FILE',payload:{id:'f',fileName:'both.dat',text:'source',parsed:{format:'rs-dat',meta:{},traces:[freq,time]}}}});
  state = workspaceReducer(state,{slice:'panes',limit:4,action:{type:'SET_PANE_COUNT',payload:2}});
  for (const [trace,targetPaneId] of [[freq,'pane-1'],[time,'pane-2']] as const) state = workspaceReducer(state,{slice:'panes',limit:4,action:{type:'ASSIGN_TRACE_TO_PANE',payload:{trace,targetPaneId,allTraces:[freq,time]}}});
  state = workspaceReducer(state,{slice:'markers',action:{type:'PLACE_MARKER',payload:{trace:time,targetFreq:5}}});
  const plan = planLastPaneRemoval(state,'pane-2');
  expect(plan.ok && plan.plan.unplaced).toEqual(['time']);
  const command = {slice:'remove-last-pane' as const,targetPaneId:'pane-2',expectedRevision:state.revision,confirmed:false,limit:4 as const};
  expect(workspaceReducer(state,command)).toBe(state);
  const next = workspaceReducer(state,{...command,confirmed:true});
  expect(next.panes.tracePaneMap.time).toEqual([]);
  expect(next.files.files).toHaveLength(1);
  expect(next.markers.markers).toHaveLength(1);
});

it('moves compatible lines, preserves incompatible lines paneless, and round trips them', async () => {
  const { snapshotFromWorkspace, workspaceFromSnapshot } = await import('../../src/stores/aggregate-workspace-store');
  const { migrateWorkspaceV5 } = await import('../../src/domain/workspace-migrate-v5');
  const freq = makeTestTrace({name:'freq',id:'freq',units:{x:'Hz',y:'dB'}});
  const time = makeTestTrace({name:'time',id:'time',domain:'time',family:'waveform',units:{x:'s',y:'V'}});
  let engine = initialWorkspaceEngine();
  const change = (command: Parameters<typeof workspaceReducer>[1]) => { engine = workspaceEngineReducer(engine,{type:'change',command}); };
  change({slice:'files',action:{type:'ADD_PARSED_FILE',payload:{id:'f',fileName:'both.dat',text:'source',parsed:{format:'rs-dat',meta:{},traces:[freq,time]}}}});
  change({slice:'panes',limit:4,action:{type:'SET_PANE_COUNT',payload:2}});
  for (const [trace,targetPaneId] of [[freq,'pane-1'],[time,'pane-2']] as const) change({slice:'panes',limit:4,action:{type:'ASSIGN_TRACE_TO_PANE',payload:{trace,targetPaneId,allTraces:[freq,time]}}});
  change({slice:'lines',action:{type:'ADD_LINE',payload:{id:41,type:'v',value:5,paneIds:['pane-2'],label:'V1'}}});
  change({slice:'lines',action:{type:'ADD_LINE',payload:{id:42,type:'h',value:1,paneIds:['pane-2'],label:'H1'}}});
  change({slice:'panes',limit:4,action:{type:'SET_ACTIVE_PANE',payload:'pane-1'}});
  change({slice:'remove-last-pane',targetPaneId:'pane-2',expectedRevision:engine.present.revision,confirmed:true,limit:4});
  expect(engine.present.lines.refLines.map(line => [line.id,line.paneIds])).toEqual([[41,[]],[42,[]]]);
  const snapshot=snapshotFromWorkspace(engine.present); expect(snapshot).not.toBeNull();
  const parsed=migrateWorkspaceV5(JSON.parse(JSON.stringify(snapshot))); expect(parsed).not.toBeNull();
  const loaded=parsed && workspaceFromSnapshot(initialWorkspaceEngine().present,parsed);
  expect(loaded?.lines.refLines).toEqual(engine.present.lines.refLines);
  engine=workspaceEngineReducer(engine,{type:'undo'}); expect(engine.present.lines.refLines.map(line=>line.paneIds)).toEqual([['pane-2'],['pane-2']]);
  engine=workspaceEngineReducer(engine,{type:'redo'}); expect(engine.present.lines.refLines.every(line=>line.paneIds.length === 0)).toBe(true);
});

it('moves a compatible pane line while preserving its identity', () => {
  const trace=makeTestTrace({name:'same',id:'same',units:{x:'Hz',y:'dB'}});
  let state=initialWorkspaceEngine().present;
  state=workspaceReducer(state,{slice:'files',action:{type:'ADD_PARSED_FILE',payload:{id:'f',fileName:'one.dat',text:'source',parsed:{format:'rs-dat',meta:{},traces:[trace]}}}});
  state=workspaceReducer(state,{slice:'panes',limit:4,action:{type:'SET_PANE_COUNT',payload:2}});
  for(const targetPaneId of ['pane-1','pane-2']) state=workspaceReducer(state,{slice:'panes',limit:4,action:{type:'ASSIGN_TRACE_TO_PANE',payload:{trace,targetPaneId,allTraces:[trace]}}});
  state=workspaceReducer(state,{slice:'lines',action:{type:'ADD_LINE',payload:{id:71,type:'h',value:1,paneIds:['pane-2'],label:'H1'}}});
  const next=workspaceReducer(state,{slice:'remove-last-pane',targetPaneId:'pane-2',expectedRevision:state.revision,confirmed:true,limit:4});
  expect(next.lines.refLines).toEqual([{id:71,type:'h',value:1,paneIds:['pane-1'],label:'H1',axisUnit:'dB'}]);
});

it('retains linked member IDs when a compatible pane is removed', async () => {
  const trace=makeTestTrace({name:'same',id:'same',units:{x:'Hz',y:'dB'}});
  let state=initialWorkspaceEngine().present;
  state=workspaceReducer(state,{slice:'files',action:{type:'ADD_PARSED_FILE',payload:{id:'f',fileName:'one.dat',text:'source',parsed:{format:'rs-dat',meta:{},traces:[trace]}}}});
  state=workspaceReducer(state,{slice:'panes',limit:4,action:{type:'SET_PANE_COUNT',payload:2}});
  for(const targetPaneId of ['pane-1','pane-2']) state=workspaceReducer(state,{slice:'panes',limit:4,action:{type:'ASSIGN_TRACE_TO_PANE',payload:{trace,targetPaneId,allTraces:[trace]}}});
  state=workspaceReducer(state,{slice:'lines',action:{type:'ADD_LINE',payload:{id:71,type:'v',value:1,paneIds:['pane-1','pane-2'],label:'V1'}}});
  const ids=state.lines.refLines.map(line=>line.id).sort();
  expect(ids).toHaveLength(1);
  const next=workspaceReducer(state,{slice:'remove-last-pane',targetPaneId:'pane-2',expectedRevision:state.revision,confirmed:true,limit:4});
  expect(next.lines.refLines.map(line=>line.id).sort()).toEqual(ids);
  expect(next.lines.refLines[0]?.paneIds).toEqual(['pane-1']);
  const { snapshotFromWorkspace, workspaceFromSnapshot } = await import('../../src/stores/aggregate-workspace-store');
  const { migrateWorkspaceV5 } = await import('../../src/domain/workspace-migrate-v5');
  const snapshot = snapshotFromWorkspace(next);
  const parsed = migrateWorkspaceV5(JSON.parse(JSON.stringify(snapshot)));
  expect(parsed).not.toBeNull();
  const loaded = parsed && workspaceFromSnapshot(initialWorkspaceEngine().present, parsed);
  expect(loaded?.lines.refLines.map(line=>line.id).sort()).toEqual(ids);
  const changed = workspaceReducer(next,{slice:'panes',limit:4,action:{type:'REMOVE_MEMBERSHIP',payload:{traceName:'same',paneId:'pane-1'}}});
  expect(changed.lines.refLines.map(line=>line.id).sort()).toEqual(ids);
  expect(changed.lines.refLines[0]?.paneIds).toEqual(['pane-1']);
});

it('reserves unplaced labels and updates only the selected line', async () => {
  const { refLineReducer, defaultRefLineState } = await import('../../src/stores/ref-line-store');
  let state = refLineReducer(defaultRefLineState,{type:'ADD_LINE',payload:{id:1,type:'v',value:1,paneIds:[],axisUnit:'Hz:Hz',label:'V1'}});
  state = refLineReducer(state,{type:'ADD_LINE',payload:{id:2,type:'v',value:1,paneIds:['pane-1'],label:'V2'}});
  state = refLineReducer(state,{type:'ADD_LINE',payload:{id:3,type:'v',value:2,paneIds:['pane-1'],label:'V1'}});
  expect(state.refLines[2]?.label).toBe('V3');
  state=refLineReducer(state,{type:'UPDATE_LINE',payload:{id:2,updates:{value:7}}});
  expect(state.refLines.map(line=>line.value)).toEqual([1,7,2]);
  expect(state.refLines.map(line=>line.id)).toEqual([1,2,3]);
  expect(state.refLines[0]?.paneIds).toEqual([]);
});

it('keeps colon-containing unit groups on their compatible pane and preserves IDs when unlinked', () => {
  const original=makeTestTrace({name:'original',id:'original',units:{x:'ticks:frame',y:'dB'}});
  const other=makeTestTrace({name:'other',id:'other',units:{x:'ticks',y:'dB'}});
  let state=initialWorkspaceEngine().present;
  state=workspaceReducer(state,{slice:'files',action:{type:'ADD_PARSED_FILE',payload:{id:'f',fileName:'one.dat',text:'source',parsed:{format:'rs-dat',meta:{},traces:[original,other]}}}});
  state=workspaceReducer(state,{slice:'panes',limit:4,action:{type:'SET_PANE_COUNT',payload:3}});
  for(const [trace,targetPaneId] of [[other,'pane-1'],[original,'pane-2'],[original,'pane-3']] as const) state=workspaceReducer(state,{slice:'panes',limit:4,action:{type:'ASSIGN_TRACE_TO_PANE',payload:{trace,targetPaneId,allTraces:[original,other]}}});
  state=workspaceReducer(state,{slice:'lines',action:{type:'ADD_LINE',payload:{id:71,type:'v',value:1,paneIds:['pane-2','pane-3'],label:'V1'}}});
  state=workspaceReducer(state,{slice:'remove-last-pane',targetPaneId:'pane-3',expectedRevision:state.revision,confirmed:true,limit:4});
  expect(state.lines.refLines.map(line=>line.id)).toEqual([71]);
  expect(state.lines.refLines[0]?.paneIds).toEqual(['pane-2']);
});
