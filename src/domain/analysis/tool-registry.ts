import type { AnalysisInputs, Capability } from '../../types/registry-contract';
import type { Trace } from '../../types/trace';
import { noisePsdTool } from './tools/noise-psd';
import { ip3Tool } from './tools/ip3';
import { peakTableTool } from './tools/peak-table';
import { rangeStatsTool } from './tools/range-stats';
import { bandwidthTool } from './tools/bandwidth';
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

export const ANALYSIS_TOOLS = [noisePsdTool, ip3Tool, peakTableTool, rangeStatsTool, bandwidthTool, crossingsTool, lineCrossingsTool, rippleTool, occupiedBandwidthTool, channelPowerTool, reciprocityIsolationTool, stabilityTool, offsetScaleTool, smoothTool, traceMathTool] as const;
export const ANALYSIS_TOOL_IDS: readonly string[] = ANALYSIS_TOOLS.map(tool => tool.meta.id);
export function getAnalysisTool(id: string) { return ANALYSIS_TOOLS.find(tool => tool.meta.id === id); }

export interface AddableToolTarget {
  readonly trace: Trace | null;
  readonly inputs: AnalysisInputs;
  readonly analyses: readonly { readonly toolId: string }[];
}
export function listAddableTools(target: AddableToolTarget) {
  return ANALYSIS_TOOLS.filter(tool => tool.addable !== false && tool.kind !== 'view').map(tool => {
    const capability: Capability = tool.kind === 'math' ? { allowed: true } : target.trace ? tool.appliesTo(target.trace) : { allowed: false, reason: 'Select a trace.' };
    const inputCapability = capability.allowed && tool.kind !== 'math' ? tool.appliesToInputs?.(target.inputs) : capability;
    const failure = !capability.allowed ? capability : inputCapability && !inputCapability.allowed ? inputCapability : undefined;
    return { id: tool.meta.id, kind: tool.kind, title: tool.meta.title, description: tool.meta.description, open: target.analyses.some(instance => instance.toolId === tool.meta.id), ...(failure ? { disabledReason: failure.reason } : {}) };
  }).sort((a, b) => a.title.localeCompare(b.title));
}
