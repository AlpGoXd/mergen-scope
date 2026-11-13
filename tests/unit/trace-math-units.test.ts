import { describe, expect, it } from 'vitest';
import { getEffectiveTraceYUnit } from '../../src/domain/units';
import { traceMathTool } from '../../src/domain/analysis/tools/trace-math';
import { traceMathAdvice } from '../../src/domain/analysis/card-view';
import { makeTestTrace } from './helpers';

describe('trace math units', () => {
  it('uses the pack unit for division', () => {
    const a = makeTestTrace({ id: 'a', units: { x: 'Hz', y: 'V' } });
    const b = makeTestTrace({ id: 'b', units: { x: 'Hz', y: 'V' } });
    const output = traceMathTool.compute({ traces: [a, b] }, { operation: 'divide' })[0];
    expect(output?.type === 'trace' ? output.trace.units.y : null).toBe('');
    expect(traceMathAdvice('divide', a, b)).toBeUndefined();
  });
  it('computes an unlabelled output and exposes its warning', () => {
    const a = makeTestTrace({ id: 'a', units: { x: 'Hz', y: 'V' } });
    const b = makeTestTrace({ id: 'b', units: { x: 'Hz', y: 'A' } });
    const output = traceMathTool.compute({ traces: [a, b] }, { operation: 'add' })[0];
    expect(output?.type).toBe('trace');
    if (output?.type !== 'trace') throw new Error('missing trace');
    expect(output.trace.units.y).toBeNull();
    expect(traceMathAdvice('add', a, b)).toBe('V + A has no meaningful unit.');
  });
  it('does not infer dB for a unitless subtraction', () => {
    const trace = makeTestTrace({ kind: 'derived', operationType: 'subtract', units: { x: 'Hz', y: null } });
    expect(getEffectiveTraceYUnit(trace)).toBe('');
  });
});
