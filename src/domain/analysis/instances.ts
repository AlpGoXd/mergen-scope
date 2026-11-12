import type { AnalysisInstance } from '../../types/analysis-instance';
import type { AnalysisInputs, AnalysisOutput, AnalysisTool, ParameterSchema, ParameterValue } from '../../types/registry-contract';
import type { DerivedTrace, Trace } from '../../types/trace';
import { validateParameters } from './tool-contract';
import { getAnalysisTool } from './tool-registry';
import { computeBinaryTraceMathData } from '../trace-ops';
import type { BinaryOp } from '../trace-ops';
import { alignAndCompute, describeStimulus } from './trace-math-align';
import type { MathFill, MathPoints } from './trace-math-align';
import { derived } from './tools/shared';
import { traceMathUnit } from '../trace-math-units';

export type InstanceResult = { readonly outputs: readonly AnalysisOutput[]; readonly reason?: never } | { readonly outputs?: never; readonly reason: string };

/** IDs are allocated by the owning store; this helper has no global state. */
export function createInstance(id: string, toolId: string, source: AnalysisInstance['source'], params: Record<string, ParameterValue> = {}): AnalysisInstance | null {
  const tool = getAnalysisTool(toolId);
  if (!tool) return null;
  const validated = validateParameters(tool.params as ParameterSchema, params);
  if (!validated.valid) return null;
  return { id, toolId, params: { ...validated.values }, source: { ...source }, collapsed: false, outputTraceId: null };
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
  const capability = tool.appliesToInputs?.(resolved, validated.values);
  if (capability && !capability.allowed) return { reason: capability.reason };
  if (instance.toolId === 'trace-math' && primary && second) {
    const operation = validated.values['operation'] as BinaryOp;
    const points = (validated.values['points'] || undefined) as MathPoints | undefined;
    const fill = (validated.values['fill'] || undefined) as MathFill | undefined;
    if (instance.outputTraceId && !points && !fill && !describeStimulus(primary, second).identical) {
      const computation = computeBinaryTraceMathData(primary.data, second.data, 'auto', operation);
      if (computation.error || !computation.data) return { reason: computation.error ?? 'No valid points to combine.' };
      return { outputs: [{ type: 'trace', trace: { ...derived(primary, computation.data, operation, { ...validated.values }, [primary.id, second.id]), units: { ...primary.units, y: traceMathUnit(primary.units.y, second.units.y, operation).unit } } }] };
    }
    const computation = alignAndCompute(primary, second, operation, points, fill);
    if ('reason' in computation) return { reason: computation.reason };
  }
  const outputs = tool.compute(resolved, validated.values);
  if (instance.toolId === 'peak-table' && outputs.some(output => output.type === 'table' && output.rows.length === 0)) return { reason: 'No peaks found.' };
  if (tool.kind === 'measure' && outputs.length === 0) {
    const view = inputs.visibleRange;
    return { reason: instance.toolId === 'range-stats' && validated.values['range'] === 'visible' && view && Number.isFinite(view.left) && Number.isFinite(view.right) && view.left < view.right && (primary?.data.length ?? 0) > 0
      ? 'No samples in the visible range: zoom out or choose Range: All.'
      : 'Nothing to measure on this trace.' };
  }
  return { outputs };
}

/** Assign identity only at creation; later recomputation changes samples alone. */
export function makeAnalysisOutput(instance: AnalysisInstance, inputs: AnalysisInputs, id: string, name: string): DerivedTrace | null {
  const result = computeInstance(instance, inputs);
  const output = result.outputs?.find(item => item.type === 'trace');
  if (!output || output.type !== 'trace' || output.trace.kind !== 'derived') return null;
  return { ...output.trace, id, name, dn: name, analysisId: instance.id };
}

/**
 * A channel's short name for a derived name: "scope.csv ch1 (v)" → "CH1". Drops the file name (the card shows it)
 * and a trailing unit (an FFT is not in V), and takes the header's case back from the trace name when the
 * tabular importer lowercased it in the display name.
 */
export function shortTraceLabel(trace: Trace): string {
  const label = trace.dn || trace.name;
  const file = trace.file ?? '';
  let short = file && label.toLowerCase().startsWith(`${file.toLowerCase()} `) ? label.slice(file.length + 1) : label;
  if (short && short === short.toLowerCase()) {
    const at = trace.name.toLowerCase().indexOf(short);
    if (at >= 0) short = trace.name.slice(at, at + short.length);
  }
  return short.replace(/\s*\([^()]*\)\s*$/, '').trim() || label;
}

export function autoOutputName(instance: AnalysisInstance, traces: readonly Trace[]): string {
  const source = traces.find(trace => trace.id === instance.source.traceId);
  const a = source?.dn || source?.name || 'Trace';
  if (instance.toolId === 'trace-math') {
    const second = traces.find(trace => trace.id === instance.source.secondTraceId);
    const op = instance.params['operation'];
    const symbol = op === 'subtract' ? '−' : op === 'multiply' ? '×' : op === 'divide' ? '÷' : '+';
    return `${a} ${symbol} ${second?.dn || second?.name || 'Trace'}`;
  }
  if (instance.toolId === 'fft') return `FFT · ${source ? shortTraceLabel(source) : 'Trace'}`;
  if (instance.toolId === 'smooth') {
    const method = instance.params['method'];
    const label = method === 'median-filter' ? 'Median' : method === 'savitzky-golay' ? 'SG' : method === 'none' ? 'None' : 'MA';
    return `${a} · smoothed · ${label} ${String(instance.params['window'] ?? 11)}${method === 'savitzky-golay' ? ` order ${String(instance.params['sgOrder'] ?? 2)}` : ''}`;
  }
  const offset = Number(instance.params['offset'] ?? 0), scale = Number(instance.params['scale'] ?? 1);
  const unit = source?.units.y ? ` ${source.units.y}` : '';
  const parts = [offset !== 0 ? `offset ${offset > 0 ? '+' : ''}${offset}${unit}` : '', scale !== 1 ? `scale ×${scale}` : ''].filter(Boolean);
  return `${a} · ${parts.length ? parts.join(' · ') : 'offset 0'}`;
}

export interface AnalysisOutputState {
  readonly analyses: readonly AnalysisInstance[];
  readonly traces: readonly Trace[];
  readonly derivedTraces: readonly Trace[];
  /** What the panes show, for outputs whose Range is Visible (FFT). */
  readonly view?: Pick<AnalysisInputs, 'paneRanges' | 'tracePaneMap'>;
}

/** Pane x ranges from the charts' reported views, for `AnalysisInputs.paneRanges`. */
export function paneRangesOf(views: Readonly<Record<string, { readonly x: readonly [number, number] | null }>>): Record<string, { left: number; right: number }> {
  const ranges: Record<string, { left: number; right: number }> = {};
  for (const [paneId, view] of Object.entries(views)) if (view.x) ranges[paneId] = { left: view.x[0], right: view.x[1] };
  return ranges;
}

/** Some created output depends on what a pane shows, so a pan or zoom must recompute it. */
export function outputsFollowView(analyses: readonly AnalysisInstance[]): boolean {
  return analyses.some(instance => instance.outputTraceId !== null && instance.params['range'] === 'visible');
}

export function recomputeOutputs(state: AnalysisOutputState): { analyses: AnalysisInstance[]; derivedTraces: Trace[] } {
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
    if (instance?.outputTraceId && !derivedTraces.some(trace => trace.id === instance.outputTraceId)) { const { autoName: _autoName, ...rest } = instance; analyses[index] = { ...rest, outputTraceId: null }; done.add(index); return; }
    if (!instance || !instance.outputTraceId || getAnalysisTool(instance.toolId)?.kind !== 'math') { done.add(index); return; }
    visiting.add(index);
    for (const id of [instance.source.traceId, instance.source.secondTraceId]) {
      const dependency = id ? owners.get(id) : undefined;
      if (dependency !== undefined) visit(dependency);
    }
    const missing = !instance.source.traceId || !sources.has(instance.source.traceId) || (instance.toolId === 'trace-math' && (!instance.source.secondTraceId || !sources.has(instance.source.secondTraceId)));
    if (!missing) {
      const outputIndex = derivedTraces.findIndex(trace => trace.id === instance.outputTraceId);
      const old = derivedTraces[outputIndex];
      const result = computeInstance(instance, { traces: [...sources.values()], ...state.view });
      const output = result.outputs?.find(item => item.type === 'trace');
      if (old && old.kind === 'derived' && output?.type === 'trace' && output.trace.kind === 'derived') {
        const data = output.trace.data;
        const unchanged = data.length === old.data.length && data.every((point, i) => point.freq === old.data[i]?.freq && point.amp === old.data[i]?.amp);
        const metadata = output.trace;
        const sameMetadata = JSON.stringify([old.operationType, old.parameters, old.sourceTraceIds, old.units]) === JSON.stringify([metadata.operationType, metadata.parameters, metadata.sourceTraceIds, metadata.units]);
        const autoName = autoOutputName(instance, [...sources.values()]);
        const dn = instance.autoName !== undefined && old.dn === instance.autoName ? autoName : old.dn;
        if (instance.autoName !== autoName) analyses[index] = { ...instance, autoName };
        const updated = unchanged && sameMetadata && dn === old.dn ? old : { ...old, dn, data, operationType: metadata.operationType, parameters: metadata.parameters, sourceTraceIds: metadata.sourceTraceIds, units: metadata.units };
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
