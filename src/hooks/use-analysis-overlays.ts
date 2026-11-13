import { useMemo } from 'react';
import { useAnalysisState } from '../stores/analysis-store';
import { computeInstance } from '../domain/analysis/instances';
import { getAnalysisTool } from '../domain/analysis/tool-registry';
import type { OverlayPoint } from '../domain/analysis/overlay-geometry';
import type { OverlayShape } from '../types/registry-contract';
import { useAnalysisContext } from './use-analysis-context';

export interface AnalysisOverlay {
  id: string;
  kind: 'polyline' | 'shapes';
  points?: readonly OverlayPoint[];
  shapes?: readonly OverlayShape[];
  colour: string;
  highlightedPeak?: number;
}

/** Compute the same output as the card for visible source traces in this pane. */
export function useAnalysisOverlays(paneId: string): AnalysisOverlay[] {
  const { analyses, highlightedPeak } = useAnalysisState();
  const ctx = useAnalysisContext();
  return useMemo(() => analyses.flatMap(instance => {
    const tool = getAnalysisTool(instance.toolId);
    if (instance.overlay === false || instance.collapsed || !tool?.outputs.some(output => output.type === 'overlay' || output.type === 'shapes')) return [];
    const source = instance.source.traceId ? ctx.traceById.get(instance.source.traceId) : undefined;
    const candidates = instance.toolId === 'line-crossings' ? ctx.inputs.traces : source ? [source] : [];
    return candidates.flatMap(trace => {
      if (ctx.inputs.vis?.[trace.name] === false || !ctx.tracePaneMap[trace.name]?.includes(paneId)) return [];
      const inputs = instance.toolId === 'line-crossings' ? { ...ctx.inputs, traces: [trace], tracePaneMap: { [trace.name]: [paneId] } } : ctx.inputs;
      const outputs = computeInstance(instance, inputs).outputs ?? [];
      return outputs.flatMap<AnalysisOverlay>(output => output.type === 'overlay' ? [{ id: instance.id, kind: 'polyline', points: output.points, colour: ctx.resolveTraceColor(trace) }] : output.type === 'shapes' ? [{ id: instance.id, kind: 'shapes', shapes: output.shapes, colour: ctx.resolveTraceColor(trace), ...(highlightedPeak?.analysisId === instance.id ? { highlightedPeak: highlightedPeak.n } : {}) }] : []);
    });
  }), [analyses, highlightedPeak, ctx.inputs, ctx.traceById, ctx.tracePaneMap, ctx.resolveTraceColor, paneId]);
}
