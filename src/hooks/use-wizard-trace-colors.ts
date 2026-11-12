import { useMemo } from 'react';
import { allocateColourBlindCreated, displayTraceColor } from '../domain/trace-colors';
import type { PaletteTrace } from '../domain/trace-palette';
import { useTraceState } from '../stores/trace-store';
import { useUiState } from '../stores/ui-store';
import { useTheme } from './use-theme';

/**
 * Colour each wizard Y column will get. `keep[i]` is the id of the existing trace the column
 * continues (Edit columns), or null for a new trace; `remove` lists traces the change drops.
 */
export function useWizardTraceColors(keep: readonly (string | null)[], remove: readonly string[]): string[] {
  const { allKnownTraces } = useTraceState();
  const { traceColors, traceHueSlots, huePalette } = useUiState();
  const { theme } = useTheme();
  const keepKey = keep.join('\u0000');
  const removeKey = remove.join('\u0000');
  return useMemo(() => {
    const removed = new Set(remove);
    const existing = allKnownTraces.filter(trace => !removed.has(trace.id));
    const fresh: PaletteTrace[] = keep.flatMap((id, index) => (id === null ? [{ id: `wizard-new-${index}`, kind: 'raw' as const }] : []));
    const assignments = allocateColourBlindCreated([...existing, ...fresh], new Map(Object.entries(traceHueSlots)));
    return keep.map((id, index) => {
      const trace = id === null ? undefined : allKnownTraces.find(item => item.id === id);
      const override = trace ? traceColors[trace.name] : undefined;
      if (override) return override;
      const assignment = assignments.get(id ?? `wizard-new-${index}`);
      return assignment ? displayTraceColor(assignment, theme, huePalette) : 'var(--accent)';
    });
    // keep/remove are compared by content (keepKey/removeKey), not by array identity.
  }, [keepKey, removeKey, allKnownTraces, traceColors, traceHueSlots, huePalette, theme]);
}
