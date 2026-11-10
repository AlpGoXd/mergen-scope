import type { Capability } from '../../../types/registry-contract';
import type { DataPoint, Trace, OperationType } from '../../../types/trace';

export const allowed: Capability = { allowed: true };
export const anyTrace = (): Capability => allowed;
export const denied = (reason: string): Capability => ({ allowed: false, reason });

export function derived(trace: Trace, data: readonly DataPoint[], operationType: OperationType, parameters: Record<string, unknown>, sourceTraceIds: readonly string[] = [trace.id]): Trace {
  return { ...trace, kind: 'derived', operationType, parameters, sourceTraceIds, data };
}
