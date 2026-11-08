import React from 'react';
import {act, renderHook} from '@testing-library/react';
import {expect,it} from 'vitest';
import {AggregateWorkspaceProvider,useAggregateWorkspace,snapshotFromWorkspace} from '../../src/stores/aggregate-workspace-store';
import {makeTestTrace} from './helpers';

it('never reuses a loaded marker serial after deletion and undo',()=>{
 const {result}=renderHook(()=>useAggregateWorkspace(),{wrapper:({children}:{children:React.ReactNode})=><AggregateWorkspaceProvider>{children}</AggregateWorkspaceProvider>});
 const snapshot=snapshotFromWorkspace(result.current.state); if(!snapshot) throw Error('snapshot');
 const trace=makeTestTrace({id:'one',name:'one'});
 const loaded={...snapshot,markers:[{id:'marker-100',trace:'one',freq:0,amp:0,type:'normal' as const,label:null,refId:null,interpolated:false}]};
 act(()=>result.current.dispatch({slice:'load',snapshot:loaded,legacy:false}));
 act(()=>result.current.dispatch({slice:'markers',action:{type:'REMOVE_MARKER',payload:0}}));
 act(()=>result.current.dispatch({slice:'markers',action:{type:'PLACE_MARKER',payload:{trace,targetFreq:0}}}));
 expect(result.current.state.markers.markers[0]?.id).toBe('marker-101');
 act(()=>result.current.historyDispatch({type:'undo'}));
 act(()=>result.current.dispatch({slice:'markers',action:{type:'PLACE_MARKER',payload:{trace,targetFreq:0}}}));
 expect(result.current.state.markers.markers[0]?.id).toBe('marker-102');
});
