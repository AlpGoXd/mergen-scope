import { describe, expect, it } from 'vitest';
import { initialWorkspaceState, workspaceReducer } from '../../src/stores/aggregate-workspace-store';
import { makeTestTrace } from './helpers';

describe('linked vertical lines', () => {
  it('recomputes mirrors when a pane changes its X group', () => {
    const hz=makeTestTrace({id:'hz',name:'hz',units:{x:'Hz',y:'dB'}});
    const seconds=makeTestTrace({id:'seconds',name:'seconds',domain:'time',family:'waveform',units:{x:'s',y:'V'}});
    let s=initialWorkspaceState();
    s=workspaceReducer(s,{slice:'files',action:{type:'ADD_PARSED_FILE',payload:{id:'f',fileName:'x',text:'x',parsed:{format:'rs-dat',meta:{},traces:[hz,seconds]}}}});
    s=workspaceReducer(s,{slice:'panes',limit:4,action:{type:'SET_PANE_COUNT',payload:2}});
    s=workspaceReducer(s,{slice:'panes',limit:4,action:{type:'ADD_MEMBERSHIP',payload:{trace:hz,targetPaneId:'pane-1',allTraces:[hz,seconds]}}});
    s=workspaceReducer(s,{slice:'panes',limit:4,action:{type:'ADD_MEMBERSHIP',payload:{trace:seconds,targetPaneId:'pane-2',allTraces:[hz,seconds]}}});
    s=workspaceReducer(s,{slice:'lines',action:{type:'ADD_LINE',payload:{id:1,type:'v',value:5,paneId:'pane-1',groupId:null,label:null}}});
    s=workspaceReducer(s,{slice:'lines',action:{type:'LOCK_LINE',payload:{lineId:1,allPaneIds:['pane-1','pane-2']}}});
    expect(s.lines.refLines.map(line=>line.paneId)).toEqual(['pane-1']);
    s=workspaceReducer(s,{slice:'panes',limit:4,action:{type:'REMOVE_MEMBERSHIP',payload:{traceName:'seconds',paneId:'pane-2'}}});
    s=workspaceReducer(s,{slice:'panes',limit:4,action:{type:'ADD_MEMBERSHIP',payload:{trace:hz,targetPaneId:'pane-2',allTraces:[hz,seconds]}}});
    expect(s.lines.refLines.map(line=>line.paneId)).toEqual(['pane-1','pane-2']);
    const removed = workspaceReducer(s,{slice:'lines',action:{type:'REMOVE_LINE',payload:1}});
    expect(removed.lines.refLines).toHaveLength(0);
    const unlinked = workspaceReducer(s,{slice:'lines',action:{type:'UNLOCK_LINE',payload:{lineId:1}}});
    expect(unlinked.lines.refLines).toEqual([{id:1,type:'v',value:5,paneId:'pane-1',groupId:null,label:null}]);
    s=workspaceReducer(s,{slice:'panes',limit:4,action:{type:'REMOVE_MEMBERSHIP',payload:{traceName:'hz',paneId:'pane-2'}}});
    expect(s.lines.refLines.map(line=>line.paneId)).toEqual(['pane-1']);
  });
});
