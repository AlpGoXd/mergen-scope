import type { ParameterValue } from './registry-contract';

export interface AnalysisInstance {
  id: string;
  toolId: string;
  params: Record<string, ParameterValue>;
  source: { traceId: string | null; secondTraceId?: string | null; lineId?: number | null };
  collapsed: boolean;
  live: boolean;
  outputTraceId: string | null;
}
