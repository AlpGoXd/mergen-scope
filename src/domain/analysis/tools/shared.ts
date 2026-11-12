import type { AnalysisInputs, Capability } from '../../../types/registry-contract';
import type { DataPoint, Trace, OperationType } from '../../../types/trace';
import { traceXGroup } from '../../pane-placement';

export const allowed: Capability = { allowed: true };
export const anyTrace = (): Capability => allowed;
export const denied = (reason: string): Capability => ({ allowed: false, reason });

export function derived(trace: Trace, data: readonly DataPoint[], operationType: OperationType, parameters: Record<string, unknown>, sourceTraceIds: readonly string[] = [trace.id]): Trace {
  return { ...trace, kind: 'derived', operationType, parameters, sourceTraceIds, data };
}

/** Time-domain tools (Waveform, FFT): x must be time. */
export const timeTraceOnly = (trace: Trace): Capability => trace.domain === 'time' || traceXGroup(trace) === 's' ? allowed : denied('Select a time trace.');

/** The x range shown by the first pane that holds `trace`, or null (use all samples). */
export function sourceVisibleRange(inputs: AnalysisInputs, trace: Trace): { left: number; right: number } | null {
  for (const paneId of inputs.tracePaneMap?.[trace.name] ?? []) {
    const range = inputs.paneRanges?.[paneId];
    if (range && Number.isFinite(range.left) && Number.isFinite(range.right) && range.left < range.right) return { left: range.left, right: range.right };
  }
  return null;
}
