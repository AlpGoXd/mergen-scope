import { describe, expect, it } from 'vitest';
import { initialWorkspaceState, workspaceReducer, snapshotFromWorkspace, workspaceFromSnapshot, traceView, initialWorkspaceEngine, workspaceEngineReducer } from '../../src/stores/aggregate-workspace-store';
import { parseMeasurementFile } from '../../src/domain/parsers/parse-file';
import { migrateWorkspaceV5 } from '../../src/domain/workspace-migrate-v5';
import { makeTestTrace } from './helpers';

describe('aggregate workspace transitions', () => {
  it('removes trace membership and markers in the same file removal transition', () => {
    const trace = makeTestTrace({name:'one', id:'trace-one'});
    let state = initialWorkspaceState();
    state = workspaceReducer(state, {slice:'files', action:{type:'ADD_PARSED_FILE',payload:{id:'file-one',fileName:'one.dat',text:'source',parsed:{format:'rs-dat',meta:{},traces:[trace]}}}});
    state = workspaceReducer(state, {slice:'panes',limit:4,action:{type:'ASSIGN_TRACE_TO_PANE',payload:{trace,targetPaneId:'pane-1',allTraces:[trace]}}});
    state = workspaceReducer(state, {slice:'markers',action:{type:'PLACE_MARKER',payload:{trace,targetFreq:5}}});
    expect(state.panes.tracePaneMap.one).toEqual(['pane-1']); expect(state.markers.markers).toHaveLength(1);
    const next = workspaceReducer(state, {slice:'files',action:{type:'REMOVE_FILE',payload:{fileId:'file-one'}}});
    expect(next.files.files).toHaveLength(0); expect(next.panes.tracePaneMap.one).toBeUndefined(); expect(next.markers.markers).toHaveLength(0);
    expect(state.files.files).toHaveLength(1); expect(state.markers.markers).toHaveLength(1);
  });
  it('keeps issued pane and marker identifiers monotonic across restores', () => {
    const initial = initialWorkspaceState(); const trace = makeTestTrace({name:'one',id:'one'});
    let state = workspaceReducer(initial, {slice:'panes',limit:4,action:{type:'SET_PANE_COUNT',payload:2}});
    state = workspaceReducer(state, {slice:'markers',action:{type:'PLACE_MARKER',payload:{trace,targetFreq:5}}});
    const restored = workspaceReducer(state, {slice:'restore',state:initial});
    expect(restored.panes.issuedPaneIds).toContain('pane-2');
    expect(restored.markers.nextMarkerSerial).toBeGreaterThan(1);
  });
  it('round trips raw sources and analysis values and rejects incompatible pane memberships', () => {
    const freq=makeTestTrace({name:'freq',id:'freq'});
    const time=makeTestTrace({name:'time',id:'time',domain:'time',family:'waveform',units:{x:'s',y:'V'}});
    let state=initialWorkspaceState();
    state=workspaceReducer(state,{slice:'files',action:{type:'ADD_PARSED_FILE',payload:{id:'f',fileName:'f.csv',text:'source text',parsed:{format:'tabular',meta:{},traces:[freq,time]}}}});
    state=workspaceReducer(state,{slice:'panes',limit:4,action:{type:'ASSIGN_TRACE_TO_PANE',payload:{trace:freq,targetPaneId:'pane-1',allTraces:[freq,time]}}});
    state=workspaceReducer(state,{slice:'ui',action:{type:'SET',payload:{key:'noiseFilter',value:'median'}}});
    state=workspaceReducer(state,{slice:'analysis',action:{type:'SET_NOISE_RESULT',payload:{id:'freq',result:[{freq:1,amp:2}]}}});
    const snapshot=snapshotFromWorkspace(state); if(!snapshot) throw Error('snapshot');
    const parsed=migrateWorkspaceV5(JSON.parse(JSON.stringify(snapshot))); expect(parsed).not.toBeNull(); if(!parsed) throw Error('serialized snapshot');
    const restored=workspaceFromSnapshot(initialWorkspaceState(),parsed); if(!restored) throw Error('restore');
    expect(restored.files.rawFileData.f).toBe('source text'); expect(restored.analysis.noiseResults.freq).toEqual([{freq:1,amp:2}]); expect(restored.ui.noiseFilter).toBe('median');
    expect(workspaceFromSnapshot(state,{...snapshot,traceAssignments:{...snapshot.traceAssignments,time:['pane-1']}})).toBeNull();
  });
  it('distinguishes hiding from deleting a view and cascades marker and membership removal', () => {
    const parsed=parseMeasurementFile('Time,CH1\n0,1\n1,2\n','file.csv');
    let state=initialWorkspaceState(); state=workspaceReducer(state,{slice:'files',action:{type:'ADD_PARSED_FILE',payload:{id:'file',fileName:'file.csv',text:'Time,CH1\n0,1\n1,2\n',parsed}}});
    const trace=traceView(state.files,state.traces).allKnownTraces[0]; const display=state.files.files[0]?.displayTraces?.[0]; if(!trace || !display) throw Error('trace');
    state=workspaceReducer(state,{slice:'panes',limit:4,action:{type:'ASSIGN_TRACE_TO_PANE',payload:{trace,targetPaneId:'pane-1',allTraces:[trace]}}});
    state=workspaceReducer(state,{slice:'markers',action:{type:'PLACE_MARKER',payload:{trace,targetFreq:0}}});
    const hidden=workspaceReducer(state,{slice:'files',action:{type:'SET_DISPLAY_TRACE_HIDDEN',payload:{fileId:'file',displayTraceId:display.id,hidden:true}}});
    expect(hidden.markers.markers).toHaveLength(1); expect(hidden.panes.tracePaneMap[trace.name]).toEqual(['pane-1']);
    const deleted=workspaceReducer(hidden,{slice:'deleteTrace',traceId:trace.id});
    expect(deleted.markers.markers).toHaveLength(0); expect(deleted.panes.tracePaneMap[trace.name]).toBeUndefined(); expect(deleted.files.files[0]?.displayTraces).toHaveLength(0);
  });
  it('keeps a deleted last network view empty through v5, and opens three ports as a matrix', () => {
    const networkText=(ports:number)=>`# Hz S RI R 50\n1 ${Array(ports*ports).fill('0.1 0').join(' ')}\n2 ${Array(ports*ports).fill('0.2 0').join(' ')}\n`;
    const one=networkText(1); let state=initialWorkspaceState();
    state=workspaceReducer(state,{slice:'files',action:{type:'ADD_PARSED_FILE',payload:{id:'one',fileName:'one.s1p',text:one,parsed:parseMeasurementFile(one,'one.s1p')}}});
    const trace=traceView(state.files,state.traces).allKnownTraces[0]; if(!trace) throw Error('default S11 missing');
    state=workspaceReducer(state,{slice:'deleteTrace',traceId:trace.id}); expect(traceView(state.files,state.traces).allKnownTraces).toHaveLength(0);
    const snapshot=snapshotFromWorkspace(state); if(!snapshot) throw Error('snapshot');
    const parsed=migrateWorkspaceV5(JSON.parse(JSON.stringify(snapshot))); if(!parsed) throw Error('v5 validation');
    const restored=workspaceFromSnapshot(initialWorkspaceState(),parsed); if(!restored) throw Error('restore');
    expect(traceView(restored.files,restored.traces).allKnownTraces).toHaveLength(0);
    const three=networkText(3); const threeState=workspaceReducer(initialWorkspaceState(),{slice:'files',action:{type:'ADD_PARSED_FILE',payload:{id:'three',fileName:'three.s3p',text:three,parsed:parseMeasurementFile(three,'three.s3p')}}});
    expect(threeState.files.files[0]?.matrixOpen).toBe(true); expect(traceView(threeState.files,threeState.traces).allKnownTraces).toHaveLength(0);
  });
  it('records a complete drag once, cancels without history, and preserves redo after no-ops', () => {
    const trace=makeTestTrace({name:'one',id:'one'}); let engine=initialWorkspaceEngine();
    engine=workspaceEngineReducer(engine,{type:'change',command:{slice:'markers',action:{type:'PLACE_MARKER',payload:{trace,targetFreq:0}}}});
    const initialFreq=engine.present.markers.markers[0]?.freq;
    engine=workspaceEngineReducer(engine,{type:'begin-gesture'});
    for(const freq of [1,2,3]) engine=workspaceEngineReducer(engine,{type:'change',command:{slice:'markers',action:{type:'UPDATE_MARKER',payload:{idx:0,updates:{requestedFreq:freq,freq,amp:freq}}}}});
    engine=workspaceEngineReducer(engine,{type:'commit-gesture'}); expect(engine.history.past).toHaveLength(2);
    engine=workspaceEngineReducer(engine,{type:'undo'}); expect(engine.present.markers.markers[0]?.freq).toBe(initialFreq);
    engine=workspaceEngineReducer(engine,{type:'change',command:{slice:'markers',action:{type:'SET_SELECTED_IDX',payload:0}}}); expect(engine.history.future).toHaveLength(1);
    engine=workspaceEngineReducer(engine,{type:'redo'}); expect(engine.present.markers.markers[0]?.freq).toBe(3);
    engine=workspaceEngineReducer(engine,{type:'begin-gesture'}); engine=workspaceEngineReducer(engine,{type:'change',command:{slice:'markers',action:{type:'UPDATE_MARKER',payload:{idx:0,updates:{requestedFreq:4,freq:4,amp:4}}}}});
    engine=workspaceEngineReducer(engine,{type:'cancel-gesture'}); expect(engine.present.markers.markers[0]?.freq).toBe(3); expect(engine.history.past).toHaveLength(2);
  });
});
