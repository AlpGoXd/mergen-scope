import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { AggregateWorkspaceProvider, initialWorkspaceState, snapshotFromWorkspace, workspaceFromSnapshot, workspaceReducer, useAggregateWorkspace } from '../../src/stores/aggregate-workspace-store';
import { Sidebar } from '../../src/components/layout/Sidebar';
import { LiveLineRow } from '../../src/components/sidebar/LiveLineRow';
import { makeTestTrace } from './helpers';

it('edits and removes paneless linked rows independently with undo, and preserves them when removing the placed group', async () => {
  let workspace: ReturnType<typeof useAggregateWorkspace>;
  function Capture() { workspace=useAggregateWorkspace(); return React.createElement(Sidebar); }
  render(React.createElement(AggregateWorkspaceProvider, null, React.createElement(Capture)));
  const trace=makeTestTrace({id:"one",name:"one"});
  const initial=workspaceReducer(initialWorkspaceState(),{slice:"files",action:{type:"ADD_PARSED_FILE",payload:{id:"f",fileName:"one.dat",text:"source",parsed:{format:"rs-dat",meta:{},traces:[trace]}}}});
  const state={...initial,panes:{...initial.panes,tracePaneMap:{one:['pane-1']}},lines:{...initial.lines,refLines:[
    {id:1,type:'v' as const,value:1,paneIds:['pane-1'],label:'V1'},
    {id:2,type:'v' as const,value:2,paneIds:[],axisUnit:'Hz:Hz',label:'V2'},
  ]}};
  act(()=>workspace.historyDispatch({type:'change',command:{slice:'restore',state}}));
  const paneless=await screen.findByTestId('ref-line-row-V2');
  fireEvent.click(within(paneless).getByRole('button',{name:'V2 value'}));
  const input=within(paneless).getByRole('textbox');
  fireEvent.change(input,{target:{value:'3'}}); fireEvent.keyDown(input,{key:'Enter'});
  await waitFor(()=>expect(workspace.state.lines.refLines.map(line=>line.value)).toEqual([1,3]));
  act(()=>workspace.historyDispatch({type:'undo'}));
  await waitFor(()=>expect(workspace.state.lines.refLines.map(line=>line.value)).toEqual([1,2]));
  fireEvent.click(within(screen.getByTestId('ref-line-row-V2')).getByRole('button',{name:'Delete V2'}));
  await waitFor(()=>expect(workspace.state.lines.refLines.map(line=>line.id)).toEqual([1]));
  act(()=>workspace.historyDispatch({type:'undo'}));
  await waitFor(()=>expect(workspace.state.lines.refLines.map(line=>line.id)).toEqual([1,2]));
  fireEvent.click(within(screen.getByTestId('ref-line-row-V1')).getByRole('button',{name:'Delete V1'}));
  await waitFor(()=>expect(workspace.state.lines.refLines).toMatchObject([{id:2,value:2,paneIds:[]}]));
  act(()=>workspace.historyDispatch({type:'change',command:{slice:'panes',limit:4,action:{type:'SET_PANE_TITLE',payload:{paneId:'pane-1',title:'Changed'}}}}));
  expect(workspace.state.lines.refLines).toMatchObject([{id:2,value:2,paneIds:[]}]);
  const snapshot=snapshotFromWorkspace(workspace.state);
  expect(snapshot).not.toBeNull();
  expect(workspaceFromSnapshot(initialWorkspaceState(),snapshot!)?.lines.refLines).toMatchObject([{id:2,value:2,paneIds:[]}]);
  act(()=>workspace.historyDispatch({type:'undo'})); // title
  expect(workspace.state.lines.refLines.map(line=>line.id)).toEqual([2]);
  act(()=>workspace.historyDispatch({type:'undo'}));
  await waitFor(()=>expect(workspace.state.lines.refLines.map(line=>line.id)).toEqual([1,2]));
  act(()=>workspace.historyDispatch({type:'redo'}));
  await waitFor(()=>expect(workspace.state.lines.refLines).toMatchObject([{id:2,value:2,paneIds:[]}]));
  act(()=>workspace.historyDispatch({type:'redo'}));
  expect(workspace.state.lines.refLines).toMatchObject([{id:2,value:2,paneIds:[]}]);
});

it('formats and parses a paneless saved frequency unit independently of the selected time trace', () => {
  const time=makeTestTrace({domain:'time',units:{x:'s',y:'V'}});
  let value=0;
  render(React.createElement(LiveLineRow,{refLine:{id:9,type:'v',value:100,paneIds:[],axisUnit:'Hz:Hz',label:'V9'},lit:false,intersections:[],panes:[],entries:[],paneViews:{},onSelect:()=>{},onHover:()=>{},onList:()=>{},changeLine:(action)=>{if(action.type==='UPDATE_LINE') value=action.payload.updates.value ?? value;},selectedTrace:time,xSpan:20}));
  const row=within(screen.getByTestId('ref-line-row-V9'));
  // The value is plain text until it is clicked; then it is a field holding the value with its unit.
  fireEvent.click(row.getByRole('button',{name:'V9 value'}));
  let input=row.getByRole('textbox');
  expect(input).toHaveValue('100 Hz');
  fireEvent.change(input,{target:{value:'2 kHz'}}); fireEvent.keyDown(input,{key:'Enter'});
  expect(value).toBe(2000);
  fireEvent.click(row.getByRole('button',{name:'V9 value'}));
  input=row.getByRole('textbox');
  fireEvent.change(input,{target:{value:'3 s'}}); fireEvent.keyDown(input,{key:'Enter'});
  expect(value).toBe(2000);
  // A refused value keeps the field open, marks it invalid and says why in a caption under it.
  expect(input).toHaveAttribute('aria-invalid','true');
  expect(row.getByRole('alert')).toHaveTextContent('Not a value');
});
