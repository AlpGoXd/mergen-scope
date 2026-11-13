import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { AggregateWorkspaceProvider, useAggregateWorkspace } from '../../src/stores/aggregate-workspace-store';
import { makeTestTrace } from './helpers';

it('keeps a large live trace intact while recording and undoing provider actions', () => {
  const data = Array.from({length:1_000_000}, (_,i) => ({freq:i,amp:i % 100}));
  const trace = makeTestTrace({id:'large',name:'large',data});
  const {result} = renderHook(() => useAggregateWorkspace(), {wrapper:({children}:{children:React.ReactNode}) => <AggregateWorkspaceProvider>{children}</AggregateWorkspaceProvider>});
  const time = () => performance.now();
  let start=time();
  act(() => result.current.dispatch({slice:'files',action:{type:'ADD_PARSED_FILE',payload:{id:'large-file',fileName:'large.dat',text:'source',parsed:{format:'rs-dat',meta:{},traces:[trace]}}}}));
  const cold=time()-start;
  start=time();
  act(() => result.current.dispatch({slice:'ui',action:{type:'SET',payload:{key:'ip3Gain',value:'1'}}}));
  const first=time()-start;
  start=time();
  act(() => result.current.dispatch({slice:'ui',action:{type:'SET',payload:{key:'ip3Gain',value:'2'}}}));
  const warm=time()-start;
  act(() => result.current.historyDispatch({type:'undo'}));
  expect(result.current.state.ui.ip3Gain).toBe('1');
  expect(result.current.state.files.files[0]?.traces[0]?.data).toBe(data);
  console.log(`Provider 1M points: add ${cold.toFixed(1)} ms, first edit ${first.toFixed(1)} ms, warm edit ${warm.toFixed(1)} ms`);
});
