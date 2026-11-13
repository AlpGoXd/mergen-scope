import type { Pane } from '../types/pane';
import type { Trace } from '../types/trace';
import type { DisplayTrace } from '../types/display';
import type { PaneTypeDefinition, PaneTypeId } from '../types/registry-contract';
import { paneTypeOfMode, typeForTrace } from './pane-type-registry';

export type PaneMemberships = Readonly<Record<string, readonly string[]>>;
export interface PlacementTrace { readonly trace: Trace; readonly paneIds: readonly string[]; readonly displayTrace?: DisplayTrace }
export type PlacementResult = { readonly allowed: true } | { readonly allowed: false; readonly reason: string };
export interface PaneRemovalPlan {
  readonly removedPaneIds: readonly string[];
  readonly memberships: PaneMemberships;
  readonly moved: readonly { readonly traceName: string; readonly from: readonly string[]; readonly to: string }[];
  readonly unplaced: readonly string[];
}
export type PaneRemovalResult = { readonly ok: true; readonly plan: PaneRemovalPlan } | { readonly ok: false; readonly reason: string };

/** A canonical axis group. Unknown units remain distinct from known groups. */
export function traceXGroup(trace: Trace): string | null {
  const unit = trace.units.x?.trim();
  if (!unit) return null;
  if (unit.toLowerCase() === 'hz') return 'Hz';
  if (unit === 's' || unit.toLowerCase() === 'sec' || unit.toLowerCase() === 'seconds') return 's';
  return unit;
}
export type PlacementPane = Omit<Pane, 'renderMode'> & { readonly renderMode: Pane['renderMode'] | 'table' };

/** Choose a compatible type for an empty destination without changing a populated pane. */
export function planEmptyPaneType(registry: Readonly<Record<PaneTypeId, PaneTypeDefinition>>, pane: PlacementPane, trace: Trace, isEmpty: boolean): { readonly mode: Pane['renderMode'] | null; readonly reason?: string } {
  if (!isEmpty) return { mode: pane.renderMode };
  const choice = typeForTrace(registry, trace, paneTypeOfMode(pane.renderMode));
  return { mode: choice.type?.renderMode ?? null, reason: choice.reason };
}
export function smithParameterCapability(family: string, row: number, col: number): PlacementResult {
  if (family !== 'S' || !Number.isInteger(row) || row < 0 || row !== col) return { allowed: false, reason: 'Smith shows reflections (S11, S22 …)' };
  return { allowed: true };
}
/** Smith requires an explicitly complex diagonal S network projection. */
export function canRenderInPane(entry: PlacementTrace, pane: PlacementPane): PlacementResult {
  if (pane.renderMode === 'cartesian' || pane.renderMode === 'table') return { allowed: true };
  const display = entry.displayTrace;
  if (!display || (display.id !== entry.trace.id && entry.trace.parameters?.['displayTraceId'] !== display.id) || (display.compat?.legacyTraceName !== undefined && display.compat.legacyTraceName !== entry.trace.name) || (entry.trace.parameters?.['datasetId'] !== undefined && entry.trace.parameters['datasetId'] !== display.datasetId) || display.source.sourceType !== 'network-parameter') return { allowed: false, reason: 'Smith shows reflections (S11, S22 …)' };
  const source = display.source;
  const parameter = smithParameterCapability(source.parameterFamily, source.row, source.col);
  if (!parameter.allowed) return parameter;
  const trace = entry.trace;
  if (display.valueType === 'scalar') {
    const metadata = trace.kind === 'raw' ? trace.networkSource : undefined;
    const network = trace.kind === 'raw' ? trace.touchstoneNetwork : undefined;
    const hasComplex = network?.samples.some(sample => { const value = sample.sMatrix[source.row]?.[source.col]; return value !== undefined && Number.isFinite(value.re) && Number.isFinite(value.im); });
    if (!metadata || metadata.family !== source.parameterFamily || metadata.row !== source.row || metadata.col !== source.col || !network || network.parameterType !== source.parameterFamily || !hasComplex) return { allowed: false, reason: 'The matching complex network data is unavailable.' };
  }
  if (source.parameterFamily !== 'S') {
    const reference = trace.kind === 'raw' ? trace.networkSource?.referenceOhms ?? trace.touchstoneNetwork?.referenceOhms : undefined;
    const z0 = typeof reference === 'number' ? reference : reference?.[0];
    if (typeof z0 !== 'number' || !Number.isFinite(z0) || z0 <= 0) return { allowed: false, reason: 'A finite positive file reference impedance is required for conversion.' };
  }
  return { allowed: true };
}
export function canPlaceMembership(entry: PlacementTrace, paneId: string, panes: readonly PlacementPane[], entries: readonly PlacementTrace[]): PlacementResult {
  const pane = panes.find(candidate => candidate.id === paneId);
  if (!pane) return { allowed: false, reason: 'The target pane no longer exists.' };
  const capability = canRenderInPane(entry, pane);
  if (!capability.allowed) return capability;
  const members = entries.filter(other => other.trace.name !== entry.trace.name && other.paneIds.includes(pane.id));
  if (!members.length) return { allowed: true };
  const group = traceXGroup(entry.trace);
  const groups = members.map(other => traceXGroup(other.trace));
  if (group === null || groups.some(value => value === null || value !== group)) { const other = members.find(member => member.trace.domain !== entry.trace.domain); return { allowed: false, reason: other ? `Cannot assign a ${entry.trace.domain}-domain trace to a pane containing ${other.trace.domain}-domain traces.` : 'The trace and pane must have the same known X unit.' }; }
  return { allowed: true };
}
export function normalizeMemberships(panes: readonly PlacementPane[], traces: readonly PlacementTrace[]): Record<string, string[]> {
  const valid = new Set(panes.map(pane => pane.id));
  return Object.fromEntries(traces.map(({ trace, paneIds }) => [trace.name, [...new Set(paneIds.filter(id => valid.has(id)))]]));
}
export interface PaneTypeChangePlan {
  readonly paneId: string;
  readonly mode: PlacementPane['renderMode'];
  readonly memberships: PaneMemberships;
  readonly moved: PaneRemovalPlan['moved'];
  readonly unplaced: readonly string[];
  readonly requiresConfirmation: boolean;
}
/** Plan relocation of only members incompatible with the requested pane type. */
export function planPaneTypeChange(panes: readonly PlacementPane[], traces: readonly PlacementTrace[], paneId: string, mode: PlacementPane['renderMode']): {ok:true;plan:PaneTypeChangePlan} | {ok:false;reason:string} {
  const target = panes.find(pane => pane.id === paneId);
  if (!target) return {ok:false,reason:'The target pane no longer exists.'};
  const affected = traces.filter(entry => entry.paneIds.includes(paneId) && !canRenderInPane(entry,{...target,renderMode:mode}).allowed);
  const names = new Set(affected.map(entry => entry.trace.name));
  const memberships = normalizeMemberships(panes,traces);
  if (affected.length === 0) return {ok:true,plan:{paneId,mode,memberships,moved:[],unplaced:[],requiresConfirmation:false}};
  if (panes.length === 1) {
    for (const entry of affected) memberships[entry.trace.name] = [];
    return {ok:true,plan:{paneId,mode,memberships,moved:[],unplaced:affected.map(entry => entry.trace.name),requiresConfirmation:true}};
  }
  const provisional = traces.map(entry => names.has(entry.trace.name) ? entry : {...entry,paneIds:entry.paneIds.filter(id => id !== paneId)});
  const removal = planPaneRemoval(panes,provisional,[paneId]);
  if (!removal.ok) return removal;
  for (const entry of affected) memberships[entry.trace.name] = [...(removal.plan.memberships[entry.trace.name] ?? [])];
  return {ok:true,plan:{paneId,mode,memberships,moved:removal.plan.moved,unplaced:removal.plan.unplaced,requiresConfirmation:removal.plan.unplaced.length > 0}};
}

/** Plan all removals against the complete remaining pane set, with no mutation. */
export function planPaneRemoval(panes: readonly PlacementPane[], traces: readonly PlacementTrace[], removedPaneIds: readonly string[]): PaneRemovalResult {
  const known = new Set(panes.map(p => p.id));
  const removed = new Set(removedPaneIds);
  if ([...removed].some(id => !known.has(id))) return { ok: false, reason: 'A requested pane no longer exists.' };
  const remaining = panes.filter(p => !removed.has(p.id));
  if (!remaining.length) return { ok: false, reason: 'At least one pane must remain.' };
  const memberships = normalizeMemberships(remaining, traces);
  const moved: { traceName: string; from: readonly string[]; to: string }[] = [];
  const unplaced: string[] = [];
  // Multiple removed copies use the earliest removed pane in visual order as the origin.
  const pending = traces.flatMap(entry => {
    const from = entry.paneIds.filter(id => removed.has(id));
    if (!from.length || (memberships[entry.trace.name]?.length ?? 0) > 0) return [];
    const pivot = Math.min(...from.map(id => panes.findIndex(pane => pane.id === id)).filter(index => index >= 0));
    const candidates = panes.map((pane, index) => ({ pane, index })).filter(item => !removed.has(item.pane.id)).sort((a, b) => Math.abs(a.index - pivot) - Math.abs(b.index - pivot) || a.index - b.index).map(item => item.pane);
    return [{ entry, from, candidates }];
  });
  const working = traces.map(entry => ({ ...entry, paneIds: memberships[entry.trace.name] ?? [] }));
  // Constrained traces first; deterministic name ordering removes input-order dependence.
  pending.sort((a, b) => a.candidates.filter(p => canRenderInPane(a.entry, p).allowed).length - b.candidates.filter(p => canRenderInPane(b.entry, p).allowed).length || a.entry.trace.name.localeCompare(b.entry.trace.name));
  // Iterative search avoids stack overflow. A bounded state budget guarantees responsiveness;
  // if reached before an optimum is proved, return a failure without changing assignments.
  const budget = 20000; let states = 0; let best: (string | null)[] = []; let bestCount = -1;
  const visited = new Map<string, number>();
  const choices: (string | null)[] = [];
  const frames: { next: number; options: (string | null)[]; count: number }[] = [];
  function optionsAt(index: number): (string | null)[] {
    const item = pending[index]; if (!item) return [];
    return [...item.candidates.filter(p => canPlaceMembership(item.entry, p.id, remaining, working).allowed).map(p => p.id), null];
  }
  if (!pending.length) { best = []; bestCount = 0; }
  else frames.push({ next: 0, options: optionsAt(0), count: 0 });
  while (frames.length && states < budget && bestCount < pending.length) {
    const index = frames.length - 1; const frame = frames[index]; const item = pending[index];
    if (!frame || !item) break;
    const current = working.find(e => e.trace.name === item.entry.trace.name); if (!current) break;
    if (frame.next >= frame.options.length) { frames.pop(); if (index > 0) { choices.pop(); const parent = pending[index - 1]; const previous = parent && working.find(e => e.trace.name === parent.entry.trace.name); if (previous) previous.paneIds = []; } continue; }
    const choice = frame.options[frame.next++]; if (choice === undefined) continue;
    current.paneIds = choice ? [choice] : []; choices[index] = choice; states++;
    const count = frame.count + (choice ? 1 : 0);
    if (index + 1 === pending.length) { if (count > bestCount) { best = [...choices]; bestCount = count; } current.paneIds = []; continue; }
    if (count + pending.length - index - 1 <= bestCount) { current.paneIds = []; continue; }
    const signature = remaining.map(p => [...new Set(working.filter(e => e.paneIds.includes(p.id)).map(e => traceXGroup(e.trace) ?? '?'))].sort().join(',')).join('|');
    const key = `${index + 1}:${signature}`; if ((visited.get(key) ?? -1) >= count) { current.paneIds = []; continue; } visited.set(key, count);
    frames.push({ next: 0, options: optionsAt(index + 1), count });
  }
  if (frames.length && states >= budget && bestCount < pending.length) return { ok: false, reason: 'Placement planning exceeded its work limit; no panes were removed.' };
  pending.forEach((item, index) => { const destination = best[index]; if (destination) { memberships[item.entry.trace.name] = [destination]; moved.push({ traceName: item.entry.trace.name, from: item.from, to: destination }); } else unplaced.push(item.entry.trace.name); });
  return { ok: true, plan: { removedPaneIds: panes.filter(p => removed.has(p.id)).map(p => p.id), memberships, moved, unplaced } };
}

export function checkPaneAssignment(trace: Trace, paneId: string, allTraces: readonly Trace[], memberships: PaneMemberships, panes: readonly PlacementPane[], displays: readonly DisplayTrace[]): PlacementResult {
  const entry = (item: Trace): PlacementTrace => ({trace:item,paneIds:memberships[item.name] ?? [],displayTrace:displays.find(display=>display.id===item.id || item.parameters?.['displayTraceId']===display.id)});
  return canPlaceMembership(entry(trace),paneId,panes,allTraces.map(entry));
}
