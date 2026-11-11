import { describe, expect, it } from 'vitest';
import { createPaneTypeRegistry } from '../../src/domain/pane-type-registry';
import { DATA_KIND_REGISTRY, resolveDataKind } from '../../src/domain/data-kind-registry';
import { validateToolParameters } from '../../src/domain/analysis/tool-contract';
import type { AnalysisOutputDeclaration, AnalysisTool, ParameterSchema } from '../../src/types/registry-contract';
import type { Trace } from '../../src/types/trace';
import { makeTestTrace } from './helpers';

describe('Phase 3 registry contracts', () => {
  it('registers only the current scalar data families and returns explicit unsupported reasons', () => {
    expect(Object.keys(DATA_KIND_REGISTRY).sort()).toEqual(['network', 'spectrum', 'waveform']);
    expect(resolveDataKind(makeTestTrace()).allowed).toBe(true);
    expect(resolveDataKind(makeTestTrace({ family: 'waveform', domain: 'time', units: { x: 's', y: 'V' } })).allowed).toBe(true);
    expect(resolveDataKind(makeTestTrace({ family: 'network' })).allowed).toBe(true);

    const unsupported = resolveDataKind(makeTestTrace({ family: 'iq' }));
    expect(unsupported).toEqual({ allowed: false, reason: 'The IQ data kind is not supported.' });
    expect(resolveDataKind(makeTestTrace({ family: 'symbol' })).allowed).toBe(false);
  });

  it('uses the Smith capability adapter and provides the common refusal reason', () => {
    const smithCapability = (trace: Trace) => trace.name === 'eligible-network'
      ? { allowed: true as const }
      : { allowed: false as const, reason: 'Only eligible reflection data can use Smith.' };
    const registry = createPaneTypeRegistry({ smithCapability });

    expect(registry.chart.appliesTo(makeTestTrace()).allowed).toBe(true);
    expect(registry.table.appliesTo(makeTestTrace()).allowed).toBe(true);
    expect(registry.smith.appliesTo(makeTestTrace({ family: 'network', name: 'eligible-network' }))).toEqual({ allowed: true });
    expect(registry.smith.appliesTo(makeTestTrace({ family: 'network' }))).toEqual({
      allowed: false,
      reason: 'Smith shows reflections (S11, S22 …)',
    });
    expect(registry.chart.appliesTo(makeTestTrace({ family: 'iq' })).allowed).toBe(false);
  });

  it('validates typed parameters and runs a pure typed measure tool', () => {
    const params = {
      offset: { kind: 'number', title: 'Offset', defaultValue: 0, min: -10, max: 10 },
      statistic: { kind: 'choice', title: 'Statistic', defaultValue: 'mean', options: ['mean', 'max'] },
    } as const satisfies ParameterSchema;
    const outputs = [
      { type: 'numbers', units: { result: 'dB' } },
      { type: 'overlay' },
    ] as const satisfies readonly AnalysisOutputDeclaration[];
    const tool: AnalysisTool<typeof params, typeof outputs> = {
      kind: 'measure',
      meta: { id: 'fixture-mean', title: 'Fixture mean', description: 'Returns a mean value for contract testing.' },
      params,
      outputs,
      appliesTo: () => ({ allowed: true }),
      compute: ({ traces }, values) => {
        const samples = traces[0]?.data.map((point) => point.amp) ?? [];
        const mean = samples.length === 0 ? 0 : samples.reduce((total, value) => total + value, 0) / samples.length;
        const result = values.statistic === 'max' ? (samples.length === 0 ? 0 : Math.max(...samples)) : mean;
        return [
          { type: 'numbers', values: { result: result + values.offset } },
          { type: 'overlay', points: samples.map((amp, index) => ({ x: index, y: amp })) },
        ];
      },
    };

    expect(validateToolParameters(tool, { offset: 2, statistic: 'max' })).toEqual({
      valid: true,
      values: { offset: 2, statistic: 'max' },
    });
    expect(validateToolParameters(tool, {}).valid).toBe(true); // defaults are supplied
    expect(validateToolParameters(tool, { offset: Number.NaN })).toMatchObject({ valid: false });
    expect(validateToolParameters(tool, { offset: 11 })).toMatchObject({ valid: false });
    expect(validateToolParameters(tool, { statistic: 'median' })).toMatchObject({ valid: false });
    expect(validateToolParameters(tool, { extra: true })).toMatchObject({ valid: false });
    expect(validateToolParameters(tool, null)).toMatchObject({ valid: false });
    expect(tool.outputs).toEqual([{ type: 'numbers', units: { result: 'dB' } }, { type: 'overlay' }]);

    const valid = validateToolParameters(tool, { offset: 2, statistic: 'mean' });
    expect(valid.valid).toBe(true);
    if (!valid.valid) return;
    const output = tool.compute({ traces: [makeTestTrace()] }, valid.values);
    expect(output).toHaveLength(2);
    const numberOutput = output[0];
    const overlayOutput = output[1];
    expect(numberOutput?.type).toBe('numbers');
    if (numberOutput?.type === 'numbers') expect(numberOutput.values.result).toBeCloseTo(16 / 3);
    expect(overlayOutput?.type).toBe('overlay');
    if (overlayOutput?.type === 'overlay') expect(overlayOutput.points).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 10 }, { x: 2, y: 0 },
    ]);

    const maxParams = validateToolParameters(tool, { offset: 2, statistic: 'max' });
    expect(maxParams.valid).toBe(true);
    if (maxParams.valid) {
      const negativeTrace = makeTestTrace({ data: [{ freq: 0, amp: -5 }, { freq: 1, amp: -3 }, { freq: 2, amp: -7 }] });
      const maxOutput = tool.compute({ traces: [negativeTrace] }, maxParams.values);
      expect(maxOutput[0]).toEqual({ type: 'numbers', values: { result: -1 } });
    }
  });
});
