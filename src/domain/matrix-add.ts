import type { TouchstoneFamily, TouchstoneView } from '../types/touchstone';
import { smithParameterCapability } from './pane-placement';

export interface MatrixTrace {
  readonly name: string;
  readonly family: TouchstoneFamily;
  readonly row: number;
  readonly col: number;
  readonly view: TouchstoneView;
  readonly paneIds: readonly string[];
}

export function matrixCellTraces(traces: readonly MatrixTrace[], family: TouchstoneFamily, row: number, col: number) {
  return traces.filter(trace => trace.family === family && trace.row === row && trace.col === col).map(({ name, view, paneIds }) => ({ name, view, paneIds }));
}

export function planMatrixAdd({ family, row, col, view, targetPaneId, targetPaneType, traces }: { family: TouchstoneFamily; row: number; col: number; view: TouchstoneView; targetPaneId: string; targetPaneType: string; traces: readonly MatrixTrace[] }) {
  const smith = targetPaneType === 'smith' || targetPaneType === 'smith-inverted';
  if (smith && !smithParameterCapability(family, row, col).allowed) return { kind: 'refused' as const, reason: 'Smith shows reflections (S11, S22 …)' };
  const duplicate = traces.find(trace => trace.family === family && trace.row === row && trace.col === col && (smith || trace.view === view) && trace.paneIds.includes(targetPaneId));
  if (duplicate) return { kind: 'duplicate' as const, traceName: duplicate.name };
  return { kind: 'add' as const, family, row, col, view, targetPaneId };
}
