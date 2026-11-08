import { describe,expect,it } from 'vitest';
import { defaultRefLineState,refLineReducer } from '../../src/stores/ref-line-store';
describe('reference line link rules',()=>{it('never locks a horizontal line',()=>{const state=refLineReducer(defaultRefLineState,{type:'ADD_LINE',payload:{id:1,type:'h',paneId:'p',groupId:null,value:2,label:null}});expect(refLineReducer(state,{type:'LOCK_LINE',payload:{lineId:1,allPaneIds:['p','q']}})).toBe(state)});});
