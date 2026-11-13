import { describe,expect,it } from 'vitest';
import { defaultRefLineState,refLineReducer } from '../../src/stores/ref-line-store';
describe('reference line membership rules',()=>{it('rejects a horizontal line with multiple panes',()=>{const state=refLineReducer(defaultRefLineState,{type:'ADD_LINE',payload:{id:1,type:'h',paneIds:['p','q'],value:2,label:null}});expect(state).toBe(defaultRefLineState)});});
