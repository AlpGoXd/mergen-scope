import type { PaneSettings } from '../types/pane';
import type { PaneMemberships, PlacementPane, PlacementResult, PlacementTrace } from './pane-placement';
import { canPlaceMembership, canRenderInPane } from './pane-placement';

export interface MembershipModel { readonly panes: readonly PlacementPane[]; readonly memberships: PaneMemberships; readonly issuedPaneIds: readonly string[]; readonly activePaneId: string; }
export type MembershipActionResult = { readonly ok: true; readonly state: MembershipModel } | { readonly ok: false; readonly reason: string };
function entriesFor(model: MembershipModel, entries: readonly PlacementTrace[]): PlacementTrace[] { return entries.map(entry => ({...entry,paneIds:model.memberships[entry.trace.name] ?? []})); }
function validated(model: MembershipModel, entry: PlacementTrace, paneId: string, entries: readonly PlacementTrace[]): PlacementResult { return canPlaceMembership(entry,paneId,model.panes,entriesFor(model,entries)); }
export function addMembership(model: MembershipModel, entry: PlacementTrace, paneId: string, entries: readonly PlacementTrace[]): MembershipActionResult {
  const valid=validated(model,entry,paneId,entries); if(!valid.allowed)return {ok:false,reason:valid.reason};
  const existing=model.memberships[entry.trace.name] ?? []; if(existing.includes(paneId))return {ok:true,state:model};
  return {ok:true,state:{...model,panes:model.panes.map(p => p.id === paneId ? {...p,typed:true} : p),memberships:{...model.memberships,[entry.trace.name]:[...existing,paneId]}}};
}
export function removeMembership(model: MembershipModel, traceName: string, paneId: string): MembershipActionResult {
  const existing=model.memberships[traceName]; if(!existing || !existing.includes(paneId))return {ok:true,state:model};
  return {ok:true,state:{...model,memberships:{...model.memberships,[traceName]:existing.filter(id=>id!==paneId)}}};
}
export function moveMembership(model: MembershipModel, entry: PlacementTrace, from: string, to: string, entries: readonly PlacementTrace[]): MembershipActionResult {
  const existing=model.memberships[entry.trace.name] ?? []; if(!existing.includes(from))return {ok:false,reason:'The source pane does not contain this trace.'};
  if(from===to)return {ok:true,state:model}; const valid=validated(model,entry,to,entries); if(!valid.allowed)return {ok:false,reason:valid.reason};
  const next=existing.filter(id=>id!==from); if(!next.includes(to))next.push(to);
  return {ok:true,state:{...model,panes:model.panes.map(p => p.id === to ? {...p,typed:true} : p),memberships:{...model.memberships,[entry.trace.name]:next}}};
}
export function addPane(model: MembershipModel, maxPanes: 4 | 8, incoming?: PlacementTrace): MembershipActionResult {
  if(model.panes.length>=maxPanes)return {ok:false,reason:`The current limit is ${maxPanes} panes.`};
  const target=model.panes.find(p=>p.id===model.activePaneId); if(!target)return {ok:false,reason:'The target pane no longer exists.'};
  const used=new Set([...model.issuedPaneIds,...model.panes.map(p=>p.id)]); let number=1;while(used.has(`pane-${number}`))number++;
  const id=`pane-${number}`; const settings: PaneSettings={...target.settings};
  const renderMode = incoming && !canRenderInPane(incoming, target).allowed ? 'cartesian' : target.renderMode;
  return {ok:true,state:{...model,panes:[...model.panes,{...target,id,title:'',renderMode,typed:false,settings}],issuedPaneIds:[...used,id]}};
}

/** Restore history without rewinding the session's pane-ID allocator. */
export function restoreMembershipModel(current: MembershipModel, snapshot: MembershipModel): MembershipModel {
  return {...snapshot, issuedPaneIds:[...new Set([...current.issuedPaneIds,...snapshot.issuedPaneIds,...current.panes.map(p=>p.id),...snapshot.panes.map(p=>p.id)])]};
}
