import type { Trace } from '../types/trace';

/** Keep derived traces immediately after their first source, preserving sibling order. */
export function orderTracesForList(traces: readonly Trace[]): Trace[] {
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
  const result: Trace[] = [];
  const seen = new Set<string>();
  const visit = (trace: Trace): void => {
    if (seen.has(trace.id)) return;
    seen.add(trace.id);
    result.push(trace);
    for (const child of children.get(trace.id) ?? []) visit(child);
  };
  for (const trace of [...roots, ...orphans, ...traces]) visit(trace);
  return result;
}
