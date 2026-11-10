import { describe, expect, it } from 'vitest';
import { areUnitsCompatible, getEffectiveTraceYUnit, traceMathUnit } from '../../src/domain/units';
import { traceMathTool } from '../../src/domain/analysis/tools/trace-math';
import { traceMathAdvice } from '../../src/domain/analysis/card-view';
import { makeTestTrace } from './helpers';

describe('trace math units', () => {
  it('adds dBm and dB', () => expect(traceMathUnit('add', 'dBm', 'dB')).toEqual({ unit: 'dBm' }));
  it('adds dB and dBm', () => expect(traceMathUnit('add', 'dB', 'dBm')).toEqual({ unit: 'dBm' }));
  it('adds dB and dB', () => expect(traceMathUnit('add', 'dB', 'dB')).toEqual({ unit: 'dB' }));
  it('subtracts dB from dBm', () => expect(traceMathUnit('subtract', 'dBm', 'dB')).toEqual({ unit: 'dBm' }));
  it('subtracts dBm from dBm', () => expect(traceMathUnit('subtract', 'dBm', 'dBm')).toEqual({ unit: 'dB' }));
  it('subtracts dB from dB', () => expect(traceMathUnit('subtract', 'dB', 'dB')).toEqual({ unit: 'dB' }));
  it('adds volts', () => expect(traceMathUnit('add', 'V', 'V')).toEqual({ unit: 'V' }));
  it('subtracts volts', () => expect(traceMathUnit('subtract', 'V', 'V')).toEqual({ unit: 'V' }));
  it('multiplies volts', () => expect(traceMathUnit('multiply', 'V', 'V')).toEqual({ unit: 'V²' }));
  it('divides volts without a warning', () => expect(traceMathUnit('divide', 'V', 'V')).toEqual({ unit: null }));
  it('warns when adding power levels', () => expect(traceMathUnit('add', 'dBm', 'dBm')).toEqual({ unit: null, warning: 'dBm + dBm has no meaningful unit: convert to linear (W) first to add powers.' }));
  it('warns when multiplying ratios', () => expect(traceMathUnit('multiply', 'dB', 'dB').warning).toBe('dB × dB has no meaningful unit.'));
  it('warns when subtracting power from a ratio', () => expect(traceMathUnit('subtract', 'dB', 'dBm').warning).toBe('dB − dBm has no meaningful unit.'));
  it('warns for mixed quantities without blocking', () => expect(areUnitsCompatible('V', 'A', 'add')).toEqual({ compatible: true, resultUnit: null, warning: 'V + A has no meaningful unit.' }));
  it('normalizes spelling and permits two plain numbers', () => {
    expect(traceMathUnit('add', ' DBM ', ' db ')).toEqual({ unit: 'dBm' });
    expect(traceMathUnit('multiply', null, '')).toEqual({ unit: null });
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
