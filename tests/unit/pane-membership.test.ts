import { describe,expect,it } from 'vitest';
import { buildPanes } from '../../src/domain/pane-math';
import { addMembership,addPane,moveMembership,removeMembership,restoreMembershipModel } from '../../src/domain/pane-membership';
import { makeTestTrace } from './helpers';
const a={...makeTestTrace(),id:'a',name:'a',units:{x:'Hz',y:'dBm'}};const t={...makeTestTrace(),id:'t',name:'t',domain:'time' as const,units:{x:'s',y:'V'}};
const panes=buildPanes(2);const model={panes,memberships:{a:['pane-1'],t:['pane-2']},issuedPaneIds:['pane-1','pane-2','pane-3'],activePaneId:'pane-1'};
const entries=[{trace:a,paneIds:['pane-1']},{trace:t,paneIds:['pane-2']}];
describe('membership commands',()=>{
 it('copies and removes only one membership, retaining explicit empty',()=>{const empty={...model,memberships:{a:[],t:[]}};const first=addMembership(empty,entries[0]!,'pane-1',entries);expect(first.ok).toBe(true);if(!first.ok)return;const second=addMembership(first.state,entries[0]!,'pane-2',entries);expect(second.ok).toBe(true);if(!second.ok)return;expect(second.state.memberships.a).toEqual(['pane-1','pane-2']);const removed=removeMembership(second.state,'a','pane-1');expect(removed.ok&&removed.state.memberships.a).toEqual(['pane-2']);if(removed.ok){const last=removeMembership(removed.state,'a','pane-2');expect(last.ok&&last.state.memberships.a).toEqual([])}});
 it('refuses an incompatible move without changing the model',()=>{const result=moveMembership(model,entries[0]!,'pane-1','pane-2',entries);expect(result.ok).toBe(false);expect(model.memberships.a).toEqual(['pane-1'])});
 it('allocates fresh IDs, copies settings and obeys the creation limit',()=>{const result=addPane(model,4);expect(result.ok).toBe(true);if(result.ok){expect(result.state.panes[2]?.id).toBe('pane-4');expect(result.state.panes[2]?.settings).toEqual(panes[0]?.settings);expect(result.state.panes[2]?.settings).not.toBe(panes[0]?.settings)}const full={...model,panes:buildPanes(4)};expect(addPane(full,4).ok).toBe(false)});
 it('does not reuse an ID after undo and chooses a compatible type for incoming data',()=>{const first=addPane(model,4);if(!first.ok)throw Error('expected pane');const restored=restoreMembershipModel(first.state,model);const second=addPane(restored,4);expect(second.ok&&second.state.panes[2]?.id).toBe('pane-5');const smith={...model,panes:model.panes.map((p,i)=>i===0?{...p,renderMode:'smith' as const}:p)};const added=addPane(smith,4,{trace:a,paneIds:[]});expect(added.ok&&added.state.panes[2]?.renderMode).toBe('cartesian')});
});
