import type { Pane } from '../types/pane';
import type { Trace } from '../types/trace';
import type { DisplayTrace } from '../types/display';
import { canRenderInPane, checkPaneAssignment, planEmptyPaneType, traceXGroup } from './pane-placement';
import type { PaneMemberships } from './pane-placement';
import { createPaneTypeRegistry } from './pane-type-registry';

type Drag = { kind: 'trace'; traceName: string } | { kind: 'file' } | { kind: 'pane'; paneId: string };
export interface DropHintInput { drag: Drag; pane: Pane; panes: readonly Pane[]; traces: readonly Trace[]; memberships: PaneMemberships; displays: readonly DisplayTrace[] }
export interface DropHint { kind: 'move' | 'already' | 'refused' | 'open' | 'swap' | 'none'; text: string; reason?: string }

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
  const trace = traces.find(item => item.name === drag.traceName);
  if (!trace) return { kind: 'none', text: '' };
  if (traceAlreadyInPane(memberships, trace.name, pane.id)) return { kind: 'already', text: `Already in ${label}` };
  const empty = !traces.some(item => memberships[item.name]?.includes(pane.id));
  if (empty && !pane.typed) {
    const registry = createPaneTypeRegistry({ smithCapability: item => canRenderInPane({ trace: item, paneIds: [], displayTrace: displays.find(display => display.id === item.id || display.id === item.parameters?.['displayTraceId']) }, { ...pane, renderMode: 'smith' }) });
    const plan = planEmptyPaneType(registry, pane, trace, true);
    if (!plan.mode) { const reason = refusalGuidance(plan.reason ?? 'This trace cannot be shown here', trace, label, []); return { kind: 'refused', text: reason, reason }; }
    return { kind: 'move', text: `Drop to show it here as a ${plan.mode === 'smith' ? 'Smith' : 'Chart'}` };
  }
  const result = checkPaneAssignment(trace, pane.id, traces, memberships, panes, displays);
  if (!result.allowed) { const reason = refusalGuidance(result.reason, trace, label, traces.filter(item => memberships[item.name]?.includes(pane.id))); return { kind: 'refused', text: reason, reason }; }
  return { kind: 'move', text: `Move to ${label}` };
}
