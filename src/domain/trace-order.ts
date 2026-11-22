import type { Trace } from '../types/trace';

export interface TraceListGroup {
  root: Trace;
  traces: Trace[];
}

/** Apply the saved order within each set of siblings and keep subtrees together. */
export function groupTracesForList(traces: readonly Trace[], preferred: readonly string[] = []): TraceListGroup[] {
  const ids = new Set(traces.map(trace => trace.id));
  const children = new Map<string, Trace[]>();
  const roots: Trace[] = [];
  const orphans: Trace[] = [];
  for (const trace of traces) {
    if (trace.kind !== 'derived') { roots.push(trace); continue; }
    const parent = trace.sourceTraceIds[0];
    if (!parent || !ids.has(parent) || parent === trace.id) { orphans.push(trace); continue; }
    const group = children.get(parent) ?? [];
    group.push(trace);
    children.set(parent, group);
  }
  const order = new Map(preferred.map((id, index) => [id, index]));
  const rank = (trace: Trace) => order.get(trace.id) ?? preferred.length;
  const compare = (a: Trace, b: Trace) => rank(a) - rank(b);
  const orderedRoots = [...roots, ...orphans].sort(compare);
  for (const siblings of children.values()) siblings.sort(compare);
  const groups: TraceListGroup[] = [];
  const seen = new Set<string>();
  const visit = (trace: Trace, group: TraceListGroup): void => {
    if (seen.has(trace.id)) return;
    seen.add(trace.id);
    group.traces.push(trace);
    for (const child of children.get(trace.id) ?? []) visit(child, group);
  };
  for (const root of [...orderedRoots, ...traces]) {
    if (seen.has(root.id)) continue;
    const group: TraceListGroup = { root, traces: [] };
    visit(root, group);
    groups.push(group);
  }
  return groups;
}

export function orderTracesForList(traces: readonly Trace[], preferred?: readonly string[]): Trace[] {
  return groupTracesForList(traces, preferred).flatMap(group => group.traces);
}
