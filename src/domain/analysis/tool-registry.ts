import type { AnalysisInputs, Capability } from '../../types/registry-contract';
import type { Trace } from '../../types/trace';
import { isEnvelopeTrace } from '../trace-model';
import { envelopeDenied } from './tools/shared';
import { noisePsdTool } from './tools/noise-psd';
import { ip3Tool } from './tools/ip3';
import { peakTableTool } from './tools/peak-table';
import { rangeStatsTool } from './tools/range-stats';
import { bandwidthTool } from './tools/bandwidth';
import { antennaFarFieldTool } from './tools/antenna-far-field';
import { crossingsTool } from './tools/crossings';
import { lineCrossingsTool } from './tools/line-crossings';
import { rippleTool } from './tools/ripple';
import { occupiedBandwidthTool } from './tools/occupied-bandwidth';
import { channelPowerTool } from './tools/channel-power';
import { reciprocityIsolationTool } from './tools/reciprocity-isolation';
import { stabilityTool } from './tools/stability';
import { offsetScaleTool } from './tools/offset-scale';
import { smoothTool } from './tools/smooth';
import { traceMathTool } from './tools/trace-math';
import { waveformTool } from './tools/waveform';
import { fftTool } from './tools/fft';
import { harmonicsTool } from './tools/harmonics';
import { resampleTool } from './tools/resample';

export function toolAppliesTo(
  tool: { readonly acceptsEnvelope?: boolean; readonly appliesTo: (trace: Trace) => Capability },
  trace: Trace,
): Capability {
  if (!tool.acceptsEnvelope && isEnvelopeTrace(trace) && trace.envelopeOf !== undefined) {
    return envelopeDenied(trace.envelopeOf);
  }
  return tool.appliesTo(trace);
}

function withEnvelopeGate<Tool extends { readonly acceptsEnvelope?: boolean; readonly appliesTo: (trace: Trace) => Capability }>(tool: Tool): Tool {
  if (tool.acceptsEnvelope) return tool;
  return { ...tool, appliesTo: (trace: Trace) => toolAppliesTo(tool, trace) };
}

export const ANALYSIS_TOOLS = [
  withEnvelopeGate(noisePsdTool),
  withEnvelopeGate(ip3Tool),
  withEnvelopeGate(peakTableTool),
  withEnvelopeGate(rangeStatsTool),
  withEnvelopeGate(bandwidthTool),
  withEnvelopeGate(antennaFarFieldTool),
  withEnvelopeGate(crossingsTool),
  withEnvelopeGate(lineCrossingsTool),
  withEnvelopeGate(rippleTool),
  withEnvelopeGate(occupiedBandwidthTool),
  withEnvelopeGate(channelPowerTool),
  withEnvelopeGate(reciprocityIsolationTool),
  withEnvelopeGate(stabilityTool),
  withEnvelopeGate(offsetScaleTool),
  withEnvelopeGate(smoothTool),
  withEnvelopeGate(traceMathTool),
  withEnvelopeGate(waveformTool),
  withEnvelopeGate(fftTool),
  withEnvelopeGate(harmonicsTool),
  withEnvelopeGate(resampleTool),
] as const;
export const ANALYSIS_TOOL_IDS: readonly string[] = ANALYSIS_TOOLS.map(tool => tool.meta.id);
export function getAnalysisTool(id: string) { return ANALYSIS_TOOLS.find(tool => tool.meta.id === id); }

export interface AddableToolTarget {
  readonly trace: Trace | null;
  readonly inputs: AnalysisInputs;
  readonly analyses: readonly { readonly toolId: string }[];
}
export function listAddableTools(target: AddableToolTarget) {
  return ANALYSIS_TOOLS.filter(tool => tool.addable !== false && tool.kind !== 'view').map(tool => {
    // A Math card may be defined before its source exists; with a target trace it still respects the tool's trace rule (FFT: time traces only).
    const capability: Capability = target.trace ? toolAppliesTo(tool, target.trace) : tool.kind === 'math' ? { allowed: true } : { allowed: false, reason: 'Select a trace.' };
    const inputCapability = capability.allowed && tool.kind !== 'math' && !tool.cardGuidesInputs ? tool.appliesToInputs?.(target.inputs) : capability;
    const failure = !capability.allowed ? capability : inputCapability && !inputCapability.allowed ? inputCapability : undefined;
    return { id: tool.meta.id, kind: tool.kind, title: tool.meta.title, description: tool.meta.description, open: target.analyses.some(instance => instance.toolId === tool.meta.id), ...(failure ? { disabledReason: failure.reason } : {}) };
  }).sort((a, b) => a.title.localeCompare(b.title));
}
