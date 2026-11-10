import type { AnalysisInstance } from '../../types/analysis-instance';
import type { AnalysisInputs, AnalysisOutput, AnalysisTool, ParameterSchema, ParameterValue } from '../../types/registry-contract';
import type { DerivedTrace, Trace } from '../../types/trace';
import { validateParameters } from './tool-contract';
import { getAnalysisTool } from './tool-registry';

export type InstanceResult = { readonly outputs: readonly AnalysisOutput[]; readonly reason?: never } | { readonly outputs?: never; readonly reason: string };

/** IDs are allocated by the owning store; this helper has no global state. */
export function createInstance(id: string, toolId: string, source: AnalysisInstance['source'], params: Record<string, ParameterValue> = {}): AnalysisInstance | null {
  const tool = getAnalysisTool(toolId);
  if (!tool) return null;
  const validated = validateParameters(tool.params as ParameterSchema, params);
  if (!validated.valid) return null;
  return { id, toolId, params: { ...validated.values }, source: { ...source }, collapsed: false, live: true, outputTraceId: null };
}

export function updateParams(instance: AnalysisInstance, params: Record<string, ParameterValue>): AnalysisInstance {
  const tool = getAnalysisTool(instance.toolId);
  if (!tool) return instance;
  const validated = validateParameters(tool.params as ParameterSchema, { ...instance.params, ...params });
  return validated.valid ? { ...instance, params: { ...validated.values } } : instance;
}

export function setCollapsed(instance: AnalysisInstance, collapsed: boolean): AnalysisInstance {
  return instance.collapsed === collapsed ? instance : { ...instance, collapsed };
}

export function moveInstance(instances: readonly AnalysisInstance[], id: string, index: number): AnalysisInstance[] {
  const from = instances.findIndex(item => item.id === id);
  if (from < 0 || !Number.isFinite(index)) return [...instances];
  const next = [...instances];
  const [item] = next.splice(from, 1);
  if (item) next.splice(Math.max(0, Math.min(next.length, Math.trunc(index))), 0, item);
  return next;
}

export function computeInstance(instance: AnalysisInstance, inputs: AnalysisInputs): InstanceResult {
  const registered = getAnalysisTool(instance.toolId);
  if (!registered) return { reason: 'Unknown analysis tool.' };
  // The schema is validated before calling the tool; its runtime value types are then guaranteed.
  const tool = registered as unknown as AnalysisTool<ParameterSchema>;
  const validated = validateParameters(tool.params, instance.params);
  if (!validated.valid) return { reason: 'Invalid analysis parameters.' };
  const primary = inputs.traces.find(trace => trace.id === instance.source.traceId);
  const second = inputs.traces.find(trace => trace.id === instance.source.secondTraceId);
  if (!primary && instance.toolId !== 'line-crossings' && instance.toolId !== 'ip3') return { reason: 'Select a source trace.' };
  if (instance.source.secondTraceId && !second) return { reason: 'Select a second source trace.' };
  const selected = instance.toolId === 'line-crossings' ? inputs.traces : [primary, second].filter((trace): trace is Trace => trace !== undefined);
  const resolved: AnalysisInputs = { ...inputs, traces: selected, lineId: instance.source.lineId };
  if (primary) { const capability = tool.appliesTo(primary); if (!capability.allowed) return { reason: capability.reason }; }
  const capability = tool.appliesToInputs?.(resolved);
  if (capability && !capability.allowed) return { reason: capability.reason };
  return { outputs: tool.compute(resolved, validated.values) };
}

/** Assign identity only at creation; later recomputation changes samples alone. */
export function makeAnalysisOutput(instance: AnalysisInstance, inputs: AnalysisInputs, id: string, name: string): DerivedTrace | null {
  const result = computeInstance(instance, inputs);
  const output = result.outputs?.find(item => item.type === 'trace');
  if (!output || output.type !== 'trace' || output.trace.kind !== 'derived') return null;
  return { ...output.trace, id, name, dn: name, analysisId: instance.id };
}

export interface LiveOutputState {
  readonly analyses: readonly AnalysisInstance[];
  readonly traces: readonly Trace[];
  readonly derivedTraces: readonly Trace[];
}

export function recomputeLiveOutputs(state: LiveOutputState): { analyses: AnalysisInstance[]; derivedTraces: Trace[] } {
  const analyses = [...state.analyses];
  const derivedTraces = [...state.derivedTraces];
  const sources = new Map(state.traces.map(trace => [trace.id, trace]));
  for (const trace of derivedTraces) sources.set(trace.id, trace);
  const owners = new Map(analyses.flatMap((instance, index) => instance.outputTraceId ? [[instance.outputTraceId, index] as const] : []));
  const visiting = new Set<number>();
  const done = new Set<number>();
  const visit = (index: number): void => {
    if (done.has(index) || visiting.has(index)) return;
    const instance = analyses[index];
    if (instance?.outputTraceId && !derivedTraces.some(trace => trace.id === instance.outputTraceId)) { analyses[index] = { ...instance, live: false, outputTraceId: null }; done.add(index); return; }
    if (!instance || !instance.live || !instance.outputTraceId || getAnalysisTool(instance.toolId)?.kind !== 'math') { done.add(index); return; }
    visiting.add(index);
    for (const id of [instance.source.traceId, instance.source.secondTraceId]) {
      const dependency = id ? owners.get(id) : undefined;
      if (dependency !== undefined) visit(dependency);
    }
    const missing = !instance.source.traceId || !sources.has(instance.source.traceId) || (instance.toolId === 'trace-math' && (!instance.source.secondTraceId || !sources.has(instance.source.secondTraceId)));
    if (missing) analyses[index] = { ...instance, live: false };
    else {
      const outputIndex = derivedTraces.findIndex(trace => trace.id === instance.outputTraceId);
      const old = derivedTraces[outputIndex];
      const result = computeInstance(instance, { traces: [...sources.values()] });
      const output = result.outputs?.find(item => item.type === 'trace');
      if (old && old.kind === 'derived' && output?.type === 'trace' && output.trace.kind === 'derived') {
        const data = output.trace.data;
        const unchanged = data.length === old.data.length && data.every((point, i) => point.freq === old.data[i]?.freq && point.amp === old.data[i]?.amp);
        const metadata = output.trace;
        const sameMetadata = JSON.stringify([old.operationType, old.parameters, old.sourceTraceIds, old.units]) === JSON.stringify([metadata.operationType, metadata.parameters, metadata.sourceTraceIds, metadata.units]);
        const updated = unchanged && sameMetadata ? old : { ...old, data, operationType: metadata.operationType, parameters: metadata.parameters, sourceTraceIds: metadata.sourceTraceIds, units: metadata.units };
        derivedTraces[outputIndex] = updated;
        sources.set(updated.id, updated);
      }
    }
    visiting.delete(index);
    done.add(index);
  };
  analyses.forEach((_, index) => visit(index));
  return { analyses, derivedTraces };
}
