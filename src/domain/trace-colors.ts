import type { Trace } from '../types/trace';

import { allocateTraceColors, symbolFor, traceColor } from './trace-palette';
import type { PaletteTrace, SymbolSetting, TraceColorAssignment, Theme } from './trace-palette';

type Palette = 'standard' | 'colour-blind';
export type ColourBlindAssignment = TraceColorAssignment & { readonly cbIndex?: number };

// Palette A. Each entry contains the source and its matching created colour.
export const COLOUR_BLIND_PALETTE = {
  light: [
    ['oklch(0.655 0.160 244)', 'oklch(0.495 0.122 244)'],
    ['oklch(0.379 0.102 48)', 'oklch(0.539 0.102 48)'],
    ['oklch(0.571 0.120 105)', 'oklch(0.411 0.086 105)'],
    ['oklch(0.456 0.098 236)', 'oklch(0.316 0.068 236)'],
    ['oklch(0.470 0.098 77)', 'oklch(0.650 0.098 77)'],
    ['oklch(0.656 0 0)', 'oklch(0.456 0 0)'],
    ['oklch(0.539 0.112 165)', 'oklch(0.379 0.078 165)'],
    ['oklch(0.479 0.170 346)', 'oklch(0.339 0.142 346)'],
  ],
  dark: [
    ['oklch(0.695 0.170 244)', 'oklch(0.495 0.122 244)'],
    ['oklch(0.888 0.098 77)', 'oklch(0.648 0.098 77)'],
    ['oklch(0.745 0.158 105)', 'oklch(0.505 0.106 105)'],
    ['oklch(0.839 0.092 236)', 'oklch(0.679 0.092 236)'],
    ['oklch(0.726 0.170 346)', 'oklch(0.526 0.170 346)'],
    ['oklch(0.822 0 0)', 'oklch(0.622 0 0)'],
    ['oklch(0.807 0.118 48)', 'oklch(0.587 0.118 48)'],
    ['oklch(0.920 0.122 165)', 'oklch(0.760 0.122 165)'],
  ],
} as const;

export function allocateColourBlindCreated(traces: readonly PaletteTrace[], previous: ReadonlyMap<string, ColourBlindAssignment>): Map<string, ColourBlindAssignment> {
  const assignments: Map<string, ColourBlindAssignment> = allocateTraceColors(traces, previous);
  const byId = new Map(traces.map(trace => [trace.id, trace]));
  const resolved = new Map<string, number>();

  const sourceIndex = (trace: PaletteTrace, visiting: Set<string>): number | undefined => {
    const slot = assignments.get(trace.id);
    if (!slot || visiting.has(trace.id)) return undefined;
    if (trace.kind === 'raw') return slot.index;
    const cached = resolved.get(trace.id);
    if (cached !== undefined) return cached;
    visiting.add(trace.id);
    for (const id of trace.sourceTraceIds ?? []) {
      const parent = byId.get(id);
      const saved = previous.get(id);
      const index = parent ? sourceIndex(parent, visiting) : saved?.cbIndex ?? saved?.index;
      if (index !== undefined) {
        visiting.delete(trace.id);
        resolved.set(trace.id, index);
        return index;
      }
    }
    visiting.delete(trace.id);
    return undefined;
  };

  for (const trace of traces) {
    const slot = assignments.get(trace.id);
    if (slot?.palette === 'created') {
      const cbIndex = sourceIndex(trace, new Set()) ?? slot.cbIndex ?? slot.index;
      assignments.set(trace.id, { ...slot, cbIndex });
    }
  }
  return assignments;
}

export function displayTraceColor(assignment: ColourBlindAssignment, theme: Theme, palette: Palette): string {
  if (palette === 'standard') return traceColor(assignment, theme);
  const pair = COLOUR_BLIND_PALETTE[theme][assignment.cbIndex ?? assignment.index];
  return pair?.[assignment.palette === 'created' ? 1 : 0] ?? traceColor(assignment, theme);
}

export function forcesHollowTraceSymbol(kind: 'raw' | 'derived', palette: Palette): boolean {
  return kind === 'derived' && palette === 'colour-blind';
}

export function traceDisplaySymbol(assignment: TraceColorAssignment, setting: SymbolSetting, palette: Palette) {
  const force = forcesHollowTraceSymbol(assignment.palette === 'created' ? 'derived' : 'raw', palette);
  return symbolFor(assignment, force ? 'always' : setting);
}

export function makeTraceColorResolver(traces: readonly Trace[], overrides: Readonly<Record<string, string>>, theme: Theme, slots: Readonly<Record<string, TraceColorAssignment>>, palette: 'standard' | 'colour-blind') {
  const assignments = allocateColourBlindCreated(traces, new Map(Object.entries(slots)));
  return (trace: Trace): string => {
    const assignment = assignments.get(trace.id);
    return overrides[trace.name] || (assignment ? displayTraceColor(assignment, theme, palette) : 'var(--accent)');
  };
}
