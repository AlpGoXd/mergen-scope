import { describe,expect,it } from 'vitest';
import { buildPanes } from '../../src/domain/pane-math';
import { defaultPaneState,paneReducer } from '../../src/stores/pane-store';

describe('pane limit and IDs',()=>{
 it('defaults to four and permits eight only when the creation preference is enabled',()=>{const four=paneReducer(defaultPaneState,{type:'SET_PANE_COUNT',payload:4});expect(four.panes).toHaveLength(4);expect(paneReducer(four,{type:'SET_PANE_COUNT',payload:5})).toBe(four);expect(paneReducer(four,{type:'SET_PANE_COUNT',payload:8,limit:8}).panes).toHaveLength(8)});
 it('retains loaded eight when default creation limit is off and does not reuse an issued ID',()=>{const base=buildPanes(4);const eight=[...base,...base.map((pane,i)=>({...pane,id:`existing-${i}`}))];const loaded=paneReducer(defaultPaneState,{type:'RESTORE',payload:{...defaultPaneState,panes:eight,issuedPaneIds:eight.map(p=>p.id)}});expect(loaded.panes).toHaveLength(8);expect(paneReducer(loaded,{type:'SET_PANE_COUNT',payload:8})).toBe(loaded);const reduced=paneReducer(loaded,{type:'SET_PANE_COUNT',payload:3,traces:[]});const restored=paneReducer(reduced,{type:'RESTORE',payload:defaultPaneState});const added=paneReducer(restored,{type:'SET_PANE_COUNT',payload:2});expect(added.panes[1]?.id).not.toBe('pane-2');});
});
