import { describe,expect,it } from 'vitest';
import { defaultMarkerState,markerReducer } from '../../src/stores/marker-store';
import { makeTestTrace } from './helpers';
const trace=(name:string)=>({...makeTestTrace(),name,id:name});
const put=(s:typeof defaultMarkerState,t:ReturnType<typeof trace>,freq:number)=>markerReducer(s,{type:'PLACE_MARKER',payload:{trace:t,targetFreq:freq}});
describe('stable delta markers',()=>{
 it('changes reference without changing absolute coordinates and converts on single or bulk reference removal',()=>{const a=trace('a'),b=trace('b');let state=put(defaultMarkerState,a,1);state=put(state,b,2);state=markerReducer(state,{type:'PLACE_MARKER',payload:{trace:b,targetFreq:3,markerType:'delta',refId:state.markers[0]?.id}});const delta=state.markers[2];expect(delta?.type).toBe('delta');state=markerReducer(state,{type:'UPDATE_MARKER',payload:{idx:2,updates:{refId:state.markers[1]?.id}}});expect(state.markers[2]).toMatchObject({id:delta?.id,freq:delta?.freq,amp:delta?.amp,refId:state.markers[1]?.id});const one=markerReducer(state,{type:'REMOVE_MARKER',payload:1});expect(one.markers[1]).toMatchObject({id:delta?.id,type:'normal',refId:null,freq:delta?.freq,amp:delta?.amp});const bulk=markerReducer(state,{type:'REMOVE_MARKERS_FOR_TRACES',payload:['b']});expect(bulk.markers).toHaveLength(1);});
 it('does not reattach a deleted reference or reuse restored marker IDs',()=>{const a=trace('a'),b=trace('b');let state=put(defaultMarkerState,a,1);state=markerReducer(state,{type:'PLACE_MARKER',payload:{trace:b,targetFreq:2,markerType:'delta',refId:state.markers[0]?.id}});const bulk=markerReducer(state,{type:'REMOVE_MARKERS_FOR_TRACES',payload:['a']});expect(bulk.markers[0]).toMatchObject({type:'normal',refId:null});const later=put(bulk,a,3);expect(later.markers[0]).toMatchObject({type:'normal',refId:null});const restored=markerReducer(later,{type:'RESTORE',payload:defaultMarkerState});const next=put(restored,a,4);expect(next.markers[0]?.id).not.toBe('marker-1');});
 it('arms explicit placement and rejects invalid delta references',()=>{const a=trace('a');const one=put(defaultMarkerState,a,1);const id=one.markers[0]?.id;if(!id)throw Error('missing id');const armed=markerReducer(one,{type:'ARM',payload:{kind:'delta',refId:id}});expect(armed.armed).toEqual({kind:'delta',refId:id});expect(markerReducer(armed,{type:'ARM',payload:{kind:'delta',refId:'missing'}})).toBe(armed);const placed=markerReducer(armed,{type:'PLACE_MARKER',payload:{trace:a,targetFreq:2,markerType:'delta',refId:id}});expect(placed.armed).toBeNull();expect(placed.markers[1]?.refId).toBe(id)});
 it('keeps identity and trace ownership immutable and rejects incomplete or nonfinite positions',()=>{
  const one=put(defaultMarkerState,trace('a'),1); const marker=one.markers[0]; if(!marker) throw Error('missing marker');
  const hostile={id:'other',trace:'b',label:'changed'} as unknown as Partial<Omit<typeof marker,'id'|'trace'>>;
  const updated=markerReducer(one,{type:'UPDATE_MARKER',payload:{idx:0,updates:hostile}});
  expect(updated.markers[0]).toMatchObject({id:marker.id,trace:marker.trace,label:'changed'});
  expect(markerReducer(one,{type:'UPDATE_MARKER',payload:{idx:0,updates:{freq:3}}})).toBe(one);
  expect(markerReducer(one,{type:'UPDATE_MARKER',payload:{idx:0,updates:{requestedFreq:3,freq:3,amp:NaN}}})).toBe(one);
 });
 it('cancels an armed delta when its reference is removed',()=>{
  const a=trace('a'); const one=put(defaultMarkerState,a,1); const id=one.markers[0]?.id; if(!id) throw Error('missing id');
  const armed=markerReducer(one,{type:'ARM',payload:{kind:'delta',refId:id}});
  for(const removed of [markerReducer(armed,{type:'REMOVE_MARKER',payload:0}),markerReducer(armed,{type:'REMOVE_MARKERS_FOR_TRACES',payload:['a']}),markerReducer(armed,{type:'CLEAR_ALL'} )]) {
   expect(removed.armed).toBeNull(); expect(put(removed,a,2).markers[0]?.type).toBe('normal');
  }
 });
 it('retains selection by marker ID when bulk deletion removes another trace',()=>{
  const a=trace('a'),b=trace('b'); let state=put(defaultMarkerState,a,1); state=put(state,b,2);
  state=markerReducer(state,{type:'PLACE_MARKER',payload:{trace:b,targetFreq:3,markerType:'delta',refId:state.markers[0]?.id}});
  const selected=state.markers[2]?.id; state=markerReducer(state,{type:'REMOVE_MARKERS_FOR_TRACES',payload:['a']});
  expect(state.selectedMkrIdx).toBe(1); expect(state.markers[state.selectedMkrIdx]).toMatchObject({id:selected,type:'normal',refId:null});
 });
});
