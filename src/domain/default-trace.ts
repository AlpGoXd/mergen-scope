import type { Trace } from '../types/trace';

/** Pick the selected trace, then the first visible trace in the target pane. */
export function defaultTraceForPane(traces: readonly Trace[], selectedName: string | null, paneId: string | null, memberships: Readonly<Record<string, readonly string[]>>, visibility: Readonly<Record<string, boolean>>): Trace | null {
  const visible = traces.filter(trace => visibility[trace.name] !== false);
  return visible.find(trace => trace.name === selectedName)
    ?? visible.find(trace => paneId !== null && memberships[trace.name]?.includes(paneId))
    ?? visible[0] ?? null;
}
