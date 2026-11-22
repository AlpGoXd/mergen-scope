import type { Pane } from '../types/pane';
import type { Trace } from '../types/trace';
import type { DisplayTrace } from '../types/display';
import { canRenderInPane, checkPaneAssignment, planEmptyPaneType, traceXGroup } from './pane-placement';
import type { PaneMemberships } from './pane-placement';
import { createPaneTypeRegistry, paneTypeOfMode } from './pane-type-registry';

type Drag = { kind: 'trace'; traceName: string; add?: boolean } | { kind: 'file' } | { kind: 'pane'; paneId: string };
export interface DropHintInput { drag: Drag; pane: Pane; panes: readonly Pane[]; traces: readonly Trace[]; memberships: PaneMemberships; displays: readonly DisplayTrace[] }
export interface DropHint { kind: 'move' | 'already' | 'refused' | 'open' | 'swap' | 'none'; text: string; reason?: string }

type TraceDropPlan = { kind: 'none' | 'already' }
  | { kind: 'refused'; text: string; reason: string }
  | { kind: 'move' | 'add'; trace: Trace; mode: Pane['renderMode']; fromPaneId: string | undefined; empty: boolean };

export function planTraceDrop(
  { pane, panes, traces, memberships, displays }: Omit<DropHintInput, 'drag'>,
  traceName: string,
  activePaneId?: string | null,
  add = false,
): TraceDropPlan {
  const index = panes.findIndex(item => item.id === pane.id);
  const trace = traces.find(item => item.name === traceName);
  if (!trace || index < 0) return { kind: 'none' };
  if (traceAlreadyInPane(memberships, traceName, pane.id)) return { kind: 'already' };

  const members = traces.filter(item => memberships[item.name]?.includes(pane.id));
  const empty = members.length === 0 && !pane.typed;
  const entry = { trace, paneIds: [], displayTrace: displays.find(display => display.id === trace.id || display.id === trace.parameters?.['displayTraceId']) };
  const registry = createPaneTypeRegistry({ smithCapability: () => canRenderInPane(entry, { ...pane, renderMode: 'smith' }) });
  const acceptsCurrent = pane.renderMode === 'smith' || pane.renderMode === 'smith-inverted'
    ? canRenderInPane(entry, pane)
    : registry[paneTypeOfMode(pane.renderMode)].appliesTo(trace);
  const choice = acceptsCurrent.allowed ? { mode: pane.renderMode }
    : !pane.typed ? planEmptyPaneType(registry, pane, trace, members.length === 0)
    : { mode: null, reason: acceptsCurrent.reason };
  const targetPanes = choice.mode === pane.renderMode ? panes : panes.map(item => item.id === pane.id ? { ...item, renderMode: choice.mode ?? item.renderMode } : item);
  const validation = choice.mode ? checkPaneAssignment(trace, pane.id, traces, memberships, targetPanes, displays)
    : { allowed: false as const, reason: choice.reason ?? 'Cannot assign trace to this pane' };
  if (!validation.allowed) {
    const reason = refusalGuidance(validation.reason, trace, `Pane ${index + 1}`, members);
    const unit = traceXGroup(trace);
    const other = members.find(member => traceXGroup(member) !== unit);
    const targetUnit = other && traceXGroup(other);
    return { kind: 'refused', text: unit && targetUnit ? `${unit} trace, this pane is ${targetUnit}` : reason, reason };
  }
  if (!choice.mode) return { kind: 'none' };

  const current = memberships[traceName] ?? [];
  const fromPaneId = add ? undefined : activePaneId && current.includes(activePaneId) ? activePaneId : current[0];
  return { kind: fromPaneId ? 'move' : 'add', trace, mode: choice.mode, fromPaneId, empty };
}

export function traceAlreadyInPane(memberships: PaneMemberships, traceName: string, paneId: string): boolean {
  return memberships[traceName]?.includes(paneId) ?? false;
}

export function refusalGuidance(reason: string, trace: Trace, paneLabel: string, members: readonly Trace[]): string {
  const other = members.find(member => traceXGroup(member) !== traceXGroup(trace));
  const group = other && traceXGroup(other);
  const targetDomain = group === 's' ? 'time' : group === 'Hz' ? 'frequency' : other?.domain;
  if (other && targetDomain && targetDomain !== trace.domain && reason.startsWith('Cannot assign a ')) return `It's a ${trace.domain} capture and ${paneLabel} shows ${targetDomain}. Drop it on a ${trace.domain} pane, an empty pane or + New pane.`;
  return `${reason.replace(/[.!?]+$/, '')}. Drop it on a compatible pane, an empty pane or + New pane.`;
}

export function dropHint({ drag, pane, panes, traces, memberships, displays }: DropHintInput): DropHint {
  const index = panes.findIndex(item => item.id === pane.id);
  if (index < 0) return { kind: 'none', text: '' };
  const label = `Pane ${index + 1}`;
  if (drag.kind === 'pane') return drag.paneId === pane.id || !panes.some(item => item.id === drag.paneId) ? { kind: 'none', text: '' } : { kind: 'swap', text: `⇄ Swap with ${label}` };
  if (drag.kind === 'file') return { kind: 'open', text: `Open in ${label}` };
  const plan = planTraceDrop({ pane, panes, traces, memberships, displays }, drag.traceName, undefined, drag.add);
  switch (plan.kind) {
    case 'none': return { kind: 'none', text: '' };
    case 'already': return { kind: 'already', text: `Already in ${label}` };
    case 'refused': return plan;
    default: return { kind: 'move', text: plan.empty
      ? `Drop to show it here as a ${plan.mode === 'smith' ? 'Smith' : 'Chart'}`
      : `${plan.kind === 'add' ? 'Add to' : 'Move to'} ${label}` };
  }
}
