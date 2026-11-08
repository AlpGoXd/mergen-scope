import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AggregateWorkspaceProvider, useAggregateWorkspace } from '../../src/stores/aggregate-workspace-store';
import { useFileDispatch, useFileState } from '../../src/stores/file-store';
import { usePaneDispatch, usePaneState } from '../../src/stores/pane-store';
import { useMarkerDispatch, useMarkerState } from '../../src/stores/marker-store';
import { makeTestTrace } from './helpers';

describe('mounted aggregate workspace',()=>{
 it('applies consecutive commands atomically and undoes a removal after effects settle',async()=>{
  const trace=makeTestTrace({id:'one',name:'one'});
  const {result}=renderHook(()=>({workspace:useAggregateWorkspace(),files:useFileState(),file:useFileDispatch(),panes:usePaneState(),pane:usePaneDispatch(),markers:useMarkerState(),marker:useMarkerDispatch()}),{wrapper:({children}:{children:React.ReactNode})=><AggregateWorkspaceProvider>{children}</AggregateWorkspaceProvider>});
  act(()=>{
    result.current.file({type:'ADD_PARSED_FILE',payload:{id:'file',fileName:'one.dat',text:'raw source',parsed:{format:'rs-dat',meta:{},traces:[trace]}}});
    result.current.pane({type:'ASSIGN_TRACE_TO_PANE',payload:{trace,targetPaneId:'pane-1',allTraces:[trace]}});
    result.current.marker({type:'PLACE_MARKER',payload:{trace,targetFreq:5}});
  });
  await waitFor(()=>expect(result.current.markers.markers).toHaveLength(1)); expect(result.current.panes.tracePaneMap.one).toEqual(['pane-1']);
  act(()=>result.current.file({type:'REMOVE_FILE',payload:{fileId:'file'}}));
  await waitFor(()=>expect(result.current.files.files).toHaveLength(0)); expect(result.current.markers.markers).toHaveLength(0); expect(result.current.panes.tracePaneMap.one).toBeUndefined();
  act(()=>result.current.workspace.historyDispatch({type:'undo'}));
  await waitFor(()=>expect(result.current.files.files).toHaveLength(1)); expect(result.current.files.rawFileData.file).toBe('raw source'); expect(result.current.panes.tracePaneMap.one).toEqual(['pane-1']); expect(result.current.markers.markers).toHaveLength(1);
 });
});
