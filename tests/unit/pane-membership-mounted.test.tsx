import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { StoreRoot } from '../../src/stores/StoreRoot';
import { useFileDispatch } from '../../src/stores/file-store';
import { useTraceState } from '../../src/stores/trace-store';
import { usePaneDispatch,usePaneState } from '../../src/stores/pane-store';
import { useMarkerDispatch,useMarkerState } from '../../src/stores/marker-store';
import { parseMeasurementFile } from '../../src/domain/parsers/parse-file';
import { makeTestTrace } from './helpers';
import { buildNetworkProjectionDisplayTrace } from '../../src/domain/dataset-builders';

describe('mounted pane memberships',()=>{
 it('preserves replicated membership and markers across hide/show after effects settle',async()=>{
  const parsed=parseMeasurementFile(readFileSync('test files/cascaded chain.s2p','utf8'),'fixture.s2p');const dataset=parsed.datasets?.find(d=>d.family==='network');if(!dataset || dataset.family!=='network')throw Error('missing dataset');
  const display=buildNetworkProjectionDisplayTrace(dataset,{row:0,col:0,component:'magnitude-db',label:'S11'});
  const {result}=renderHook(()=>({file:useFileDispatch(), traces:useTraceState(),pane:usePaneState(),dispatch:usePaneDispatch(),markers:useMarkerState(),mark:useMarkerDispatch()}),{wrapper:({children}:{children:React.ReactNode})=><StoreRoot>{children}</StoreRoot>});
  act(()=>result.current.file({type:'ADD_PARSED_FILE',payload:{id:'f',fileName:'fixture.s2p',parsed:{...parsed,displayTraces:[display]},text:'original source'}}));
  await waitFor(()=>expect(result.current.traces.allTraces).toHaveLength(1));const trace=result.current.traces.allTraces[0];if(!trace)throw Error('missing trace');
  act(()=>result.current.dispatch({type:'SET_PANE_COUNT',payload:3}));await waitFor(()=>expect(result.current.pane.panes).toHaveLength(3));
  act(()=>{result.current.dispatch({type:'ASSIGN_TRACE_TO_PANE',payload:{trace,targetPaneId:'pane-1',allTraces:[trace]}});result.current.dispatch({type:'ADD_MEMBERSHIP',payload:{trace,targetPaneId:'pane-2',allTraces:[trace]}});result.current.mark({type:'PLACE_MARKER',payload:{trace,targetFreq:trace.data[0]?.freq ?? 0}})});
  await waitFor(()=>expect(result.current.pane.tracePaneMap[trace.name]).toEqual(['pane-1','pane-2']));expect(result.current.markers.markers).toHaveLength(1);
  act(()=>result.current.dispatch({type:'MOVE_MEMBERSHIP',payload:{trace,fromPaneId:'pane-1',targetPaneId:'pane-3',allTraces:[trace]}}));await waitFor(()=>expect(result.current.pane.tracePaneMap[trace.name]).toEqual(['pane-2','pane-3']));expect(result.current.pane.paneActiveTraceMap['pane-1']).toBeNull();expect(result.current.pane.paneActiveTraceMap['pane-3']).toBe(trace.name);
  act(()=>result.current.file({type:'SET_DISPLAY_TRACE_HIDDEN',payload:{fileId:'f',displayTraceId:display.id,hidden:true}}));await waitFor(()=>expect(result.current.traces.allTraces).toHaveLength(0));expect(result.current.traces.allKnownTraces).toHaveLength(1);expect(result.current.pane.tracePaneMap[trace.name]).toEqual(['pane-2','pane-3']);expect(result.current.markers.markers).toHaveLength(1);
  const time={...makeTestTrace(),id:'time',name:'time',domain:'time' as const,units:{x:'s',y:'V'}};act(()=>result.current.file({type:'ADD_PARSED_FILE',payload:{id:'time-file',fileName:'time.dat',text:'time data',parsed:{format:'rs-dat',meta:{},traces:[time]}}}));await waitFor(()=>expect(result.current.traces.allTraces.some(t=>t.name==='time')).toBe(true));act(()=>result.current.dispatch({type:'ADD_MEMBERSHIP',payload:{trace:time,targetPaneId:'pane-2',allTraces:[time]}}));expect(result.current.pane.tracePaneMap.time ?? []).toEqual([]);
  act(()=>result.current.file({type:'SET_DISPLAY_TRACE_HIDDEN',payload:{fileId:'f',displayTraceId:display.id,hidden:false}}));await waitFor(()=>expect(result.current.traces.allTraces).toHaveLength(2));expect(result.current.pane.tracePaneMap[trace.name]).toEqual(['pane-2','pane-3']);expect(result.current.markers.markers).toHaveLength(1);
 });
});
