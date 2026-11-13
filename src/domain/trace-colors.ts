import type { Trace } from '../types/trace';

import { allocateTraceColors, clampChroma, traceColor } from './trace-palette';
import type { PaletteTrace, TraceColorAssignment, Theme } from './trace-palette';
export const COLOUR_BLIND_ORDER = [270, 135, 0, 315, 180, 225, 45, 90] as const;
export type ColourBlindAssignment = TraceColorAssignment & { readonly cbIndex?: number };

/** Retain created choices, then allocate children around their parent's displayed hue. */
export function allocateColourBlindCreated(traces: readonly PaletteTrace[], previous: ReadonlyMap<string, TraceColorAssignment>): Map<string, ColourBlindAssignment> {
  const assignments = allocateTraceColors(traces, previous);
  const out = new Map<string, ColourBlindAssignment>(assignments);
  const byId = new Map(traces.map(trace => [trace.id, trace]));
  const counts = Array<number>(8).fill(0);
  for (const trace of traces) {
    const slot = out.get(trace.id) as ColourBlindAssignment | undefined;
    if (trace.kind === 'derived' && slot?.cbIndex !== undefined && Number.isInteger(slot.cbIndex) && slot.cbIndex >= 0 && slot.cbIndex < 8) counts[slot.cbIndex] = (counts[slot.cbIndex] ?? 0) + 1;
  }
  const assign = (trace: PaletteTrace, visiting: Set<string>): number => {
    const slot = out.get(trace.id) as ColourBlindAssignment | undefined;
    if (!slot) return 0;
    if (trace.kind === 'raw') return slot.index;
    if (slot.cbIndex !== undefined && Number.isInteger(slot.cbIndex) && slot.cbIndex >= 0 && slot.cbIndex < 8) return slot.cbIndex;
    visiting.add(trace.id);
    const parent = trace.sourceTraceIds?.map(id => byId.get(id)).find(item => item && !visiting.has(item.id));
    const p = parent ? assign(parent, visiting) : 0;
    visiting.delete(trace.id);
    const order = [(p + 1) % 8, (p + 7) % 8, ...Array.from({ length: 5 }, (_, i) => (p + i + 2) % 8), p];
    const minimum = Math.min(...counts);
    const index = order.find(i => (counts[i] ?? 0) === minimum) ?? 0;
    counts[index] = (counts[index] ?? 0) + 1;
    out.set(trace.id, { ...slot, cbIndex: index });
    return index;
  };
  for (const trace of traces) if (trace.kind === 'derived') assign(trace, new Set());
  return out;
}

/** Source tones mirror the private source tones in trace-palette.ts. */
export function displayTraceColor(assignment: ColourBlindAssignment, theme: Theme, palette: 'standard' | 'colour-blind'): string {
  if (palette !== 'colour-blind') return traceColor(assignment, theme);
  const h = COLOUR_BLIND_ORDER[assignment.palette === 'source' ? assignment.index : assignment.cbIndex ?? assignment.index] ?? assignment.hue;
  // Created tones mirror trace-palette.ts.
  const l = assignment.palette === 'created' ? (theme === 'dark' ? 0.84 : 0.46) : (theme === 'dark' ? 0.75 : 0.58);
  const c = assignment.palette === 'created' ? (theme === 'dark' ? 0.10 : 0.15) : (theme === 'dark' ? 0.13 : 0.16);
  return `oklch(${l} ${clampChroma(l, c, h)} ${h})`;
}

export function makeTraceColorResolver(traces: readonly Trace[], overrides: Readonly<Record<string, string>>, theme: Theme, slots: Readonly<Record<string, TraceColorAssignment>>, palette: 'standard' | 'colour-blind') {
  const assignments = allocateColourBlindCreated(traces, new Map(Object.entries(slots)));
  return (trace: Trace): string => {
    const assignment = assignments.get(trace.id);
    return overrides[trace.name] || (assignment ? displayTraceColor(assignment, theme, palette) : 'var(--accent)');
  };
}
