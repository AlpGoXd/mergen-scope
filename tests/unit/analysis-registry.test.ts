import { describe, expect, it } from 'vitest';
import { ANALYSIS_TOOLS, ANALYSIS_TOOL_IDS, getAnalysisTool, listAddableTools } from '../../src/domain/analysis/tool-registry';
import { makeTestTrace } from './helpers';

describe('analysis registry', () => {
  it('has unique tool IDs and excludes matrix views', () => {
    expect(new Set(ANALYSIS_TOOL_IDS).size).toBe(15);
    expect(ANALYSIS_TOOL_IDS).not.toContain('vswr');
    expect(ANALYSIS_TOOL_IDS).not.toContain('return-loss');
    expect(ANALYSIS_TOOL_IDS).not.toContain('group-delay');
    expect(ANALYSIS_TOOLS.filter(tool => tool.kind === 'math')).toHaveLength(3);
    expect(getAnalysisTool('stability')?.kind).toBe('measure');
  });
  it('sorts addable tools and reports open and disabled states', () => {
    const trace = makeTestTrace({ units: { x: 'Hz', y: 'V' } });
    const items = listAddableTools({ trace, inputs: { traces: [trace] }, analyses: [{ toolId: 'ripple' }] });
    expect(items.map(item => item.title)).toEqual(items.map(item => item.title).slice().sort((a, b) => a.localeCompare(b)));
    expect(items.some(item => item.id === 'line-crossings')).toBe(false);
    expect(items.find(item => item.id === 'ripple')?.open).toBe(true);
    expect(items.find(item => item.id === 'occupied-bandwidth')?.disabledReason).toBe('Select a trace with power units (dBm or dBW).');
    expect(items.find(item => item.id === 'ip3')?.disabledReason).toBe('Place F1, F2, IM3L and IM3U markers');
    expect(items.find(item => item.id === 'trace-math')?.disabledReason).toBeUndefined();
  });
  it('allows defining a Math card before a source is available', () => {
    const items = listAddableTools({ trace: null, inputs: { traces: [] }, analyses: [] });
    expect(items.filter(item => item.kind === 'math').every(item => !item.disabledReason)).toBe(true);
  });
});
