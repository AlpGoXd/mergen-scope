import type { AnalysisInputs, AnalysisTool, ParameterValues } from '../../../types/registry-contract';
import type { DataPoint, Trace } from '../../../types/trace';
import { normalizeUnitName } from '../../units';
import { FFT_SCALE_UNITS, computeFft, fftSamples } from '../fft';
import { sliceTraceToRange } from '../range-stats';
import { allowed, denied, derived, sourceVisibleRange, timeTraceOnly } from './shared';

export const FFT_POINT_OPTIONS = ['auto', '64', '128', '256', '512', '1024', '2048', '4096', '8192', '16384', '32768', '65536'] as const;

const params = {
  window: { kind: 'choice', title: 'Window', defaultValue: 'hann', options: ['hann', 'rectangular', 'flattop', 'blackman-harris'] },
  points: { kind: 'choice', title: 'Points', defaultValue: 'auto', options: FFT_POINT_OPTIONS },
  range: { kind: 'choice', title: 'Range', defaultValue: 'visible', options: ['visible', 'all'] },
  scale: { kind: 'choice', title: 'Scale', defaultValue: 'dbv', options: ['dbv', 'v', 'dbm'] },
} as const;
type FftParams = ParameterValues<typeof params>;
const DEFAULTS: FftParams = { window: 'hann', points: 'auto', range: 'visible', scale: 'dbv' };

/** Samples are read as volts; a prefixed volt unit is scaled to volts. */
const VOLT_FACTORS: Readonly<Record<string, number>> = { v: 1, mv: 1e-3, uv: 1e-6, 'µv': 1e-6, 'μv': 1e-6, kv: 1e3 };

function samplesInRange(inputs: AnalysisInputs, trace: Trace, p: FftParams): DataPoint[] {
  const data = sliceTraceToRange(trace.data, p.range === 'visible' ? sourceVisibleRange(inputs, trace) : null);
  const factor = VOLT_FACTORS[normalizeUnitName(trace.units.y)] ?? 1;
  return factor === 1 ? data : data.map(point => ({ freq: point.freq, amp: point.amp * factor }));
}
const pointsOf = (p: FftParams): 'auto' | number => p.points === 'auto' ? 'auto' : Number(p.points);

export const fftTool: AnalysisTool<typeof params> = {
  kind: 'math', meta: { id: 'fft', title: 'FFT', description: 'Spectrum of a time trace: fundamental, harmonics, THD, noise floor.' }, params,
  outputs: [{ type: 'numbers' }, { type: 'trace' }], appliesTo: timeTraceOnly,
  appliesToInputs: (inputs, p = DEFAULTS) => {
    const trace = inputs.traces[0];
    if (!trace) return allowed;
    const chosen = fftSamples(samplesInRange(inputs, trace, p), pointsOf(p));
    return chosen.ok ? allowed : denied(chosen.reason);
  },
  compute: (inputs, p) => {
    const trace = inputs.traces[0];
    if (!trace) return [];
    const outcome = computeFft(samplesInRange(inputs, trace, p), { window: p.window, points: pointsOf(p), scale: p.scale });
    if (!outcome.ok) return [];
    const r = outcome.result;
    const harmonic = (order: number) => r.harmonics.find(item => item.order === order)?.dBc ?? NaN;
    const spectrum = derived(trace, r.spectrum, 'derived', { ...p, transform: 'fft', points: r.points });
    return [
      { type: 'numbers', values: {
        fundamentalHz: r.fundamental?.freq ?? NaN, fundamentalLevel: r.fundamental?.level ?? NaN,
        h2: harmonic(2), h3: harmonic(3), h4: harmonic(4), h5: harmonic(5), thd: r.thd ?? NaN,
        noiseFloor: r.noiseFloor, binHz: r.binHz, points: r.points,
      } },
      { type: 'trace', trace: { ...spectrum, domain: 'frequency', family: 'spectrum', isUniform: true, units: { x: 'Hz', y: FFT_SCALE_UNITS[p.scale] } } },
    ];
  },
};
