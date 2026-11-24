import type { AnalysisOutput, AnalysisTool, Capability, ParameterValues } from '../../../types/registry-contract';
import type { DataPoint, Trace } from '../../../types/trace';
import { normalizeUnitName } from '../../units';
import { FFT_SCALE_UNITS, canComputeFftSegments, computeFft } from '../fft';
import type { WindowSpec } from '../fft';
import { allowed, denied, derived, sourceVisibleRange, timeTraceOnly } from './shared';

export const FFT_POINT_OPTIONS = ['auto', '64', '128', '256', '512', '1024', '2048', '4096', '8192', '16384', '32768', '65536'] as const;
const DENSITY_DBM = ['dbm', 'dbmhz'];

// A setting belongs here only if it changes the spectrum this card creates; measurements read off it are other tools.
const params = {
  window: { kind: 'choice', title: 'Window', defaultValue: 'hann', options: ['hann', 'rectangular', 'hamming', 'blackman', 'blackman-harris', 'nuttall', 'blackman-nuttall', 'flattop', 'kaiser', 'gaussian', 'tukey', 'chebyshev'] },
  terms: { kind: 'choice', title: 'Terms', defaultValue: '4', options: ['3', '4', '7'], shownWhen: { key: 'window', values: ['blackman-harris'] } },
  beta: { kind: 'number', title: 'β', defaultValue: 8.6, min: 0, max: 50, shownWhen: { key: 'window', values: ['kaiser'] } },
  sigma: { kind: 'number', title: 'σ', defaultValue: 0.4, min: 0.05, max: 2, shownWhen: { key: 'window', values: ['gaussian'] } },
  alpha: { kind: 'number', title: 'α', defaultValue: 0.5, min: 0, max: 1, shownWhen: { key: 'window', values: ['tukey'] } },
  sidelobe: { kind: 'number', title: 'Sidelobes', defaultValue: 100, min: 20, max: 300, shownWhen: { key: 'window', values: ['chebyshev'] } },
  points: { kind: 'choice', title: 'Points', defaultValue: 'auto', options: FFT_POINT_OPTIONS },
  averaging: { kind: 'choice', title: 'Averages', defaultValue: 'off', options: ['off', 'avg4', 'avg16', 'avg64', 'max'] },
  range: { kind: 'choice', title: 'Range', defaultValue: 'visible', options: ['visible', 'all'] },
  scale: { kind: 'choice', title: 'Scale', defaultValue: 'dbv', options: ['dbv', 'v', 'dbm', 'dbmv', 'dbuv', 'dbvhz', 'vrthz', 'dbmhz'] },
  impedance: { kind: 'number', title: 'Impedance', defaultValue: 50, min: 0.001, shownWhen: { key: 'scale', values: DENSITY_DBM } },
  detrend: { kind: 'choice', title: 'Detrend', defaultValue: 'off', options: ['off', 'dc', 'linear'] },
} as const;
type FftParams = ParameterValues<typeof params>;
export const FFT_DEFAULTS: FftParams = { window: 'hann', terms: '4', beta: 8.6, sigma: 0.4, alpha: 0.5, sidelobe: 100, points: 'auto', averaging: 'off', range: 'visible', scale: 'dbv', impedance: 50, detrend: 'off' };

/** Samples are read as volts; a prefixed volt unit is scaled to volts. */
const VOLT_FACTORS: Readonly<Record<string, number>> = { v: 1, mv: 1e-3, uv: 1e-6, 'µv': 1e-6, 'μv': 1e-6, kv: 1e3 };
const FFT_CACHE_MIN_POINTS = 16_384;

interface CachedFftEntry {
  readonly key: string;
  readonly capability: Capability;
  readonly outputs: readonly AnalysisOutput[];
}

const fftOutputCache = new WeakMap<readonly DataPoint[], CachedFftEntry>();

function validRange(range: { readonly left: number; readonly right: number } | null): { readonly left: number; readonly right: number } | null {
  return range && Number.isFinite(range.left) && Number.isFinite(range.right) && range.right >= range.left ? range : null;
}

function samplesInRange(trace: Trace, range: { readonly left: number; readonly right: number } | null, factor: number): readonly DataPoint[] {
  const data = trace.data;
  if (!range && factor === 1) return data;
  const out: DataPoint[] = [];
  for (let i = 0; i < data.length; i++) {
    const point = data[i];
    if (!point || !Number.isFinite(point.freq) || !Number.isFinite(point.amp)) continue;
    if (range && (point.freq < range.left || point.freq > range.right)) continue;
    out.push(factor === 1 ? point : { freq: point.freq, amp: point.amp * factor });
  }
  return out;
}

function fftCacheKey(
  trace: Trace,
  factor: number,
  range: { readonly left: number; readonly right: number } | null,
  p: FftParams,
): string {
  return [
    trace.id,
    trace.name,
    trace.dn ?? '',
    factor,
    range ? `${range.left}:${range.right}` : 'all',
    p.window,
    p.terms,
    p.beta,
    p.sigma,
    p.alpha,
    p.sidelobe,
    p.points,
    p.averaging,
    p.scale,
    p.impedance,
    p.detrend,
  ].join('|');
}

const pointsOf = (p: FftParams): 'auto' | number => p.points === 'auto' ? 'auto' : Number(p.points);
export function windowSpecOf(p: Pick<FftParams, 'window' | 'terms' | 'beta' | 'sigma' | 'alpha' | 'sidelobe'>): WindowSpec {
  return { kind: p.window, terms: Number(p.terms) as 3 | 4 | 7, beta: p.beta, sigma: p.sigma, alpha: p.alpha, sidelobeDb: p.sidelobe };
}

export const fftTool: AnalysisTool<typeof params> = {
  kind: 'math', meta: { id: 'fft', title: 'FFT', description: 'Spectrum of a time trace.' }, params,
  parameterUnits: { sidelobe: 'dB', impedance: 'Ω' },
  outputs: [{ type: 'numbers' }, { type: 'trace' }], appliesTo: timeTraceOnly,
  appliesToInputs: (inputs, p = FFT_DEFAULTS) => {
    const trace = inputs.traces[0];
    if (!trace) return allowed;
    const range = p.range === 'visible' ? validRange(sourceVisibleRange(inputs, trace)) : null;
    const factor = VOLT_FACTORS[normalizeUnitName(trace.units.y)] ?? 1;
    const key = fftCacheKey(trace, factor, range, p);
    const cached = trace.data.length >= FFT_CACHE_MIN_POINTS ? fftOutputCache.get(trace.data) : undefined;
    if (cached && cached.key === key) return cached.capability;
    const chosen = canComputeFftSegments(trace.data, range, pointsOf(p), p.averaging);
    return chosen.ok ? allowed : denied(chosen.reason);
  },
  compute: (inputs, p) => {
    const trace = inputs.traces[0];
    if (!trace) return [];
    const range = p.range === 'visible' ? validRange(sourceVisibleRange(inputs, trace)) : null;
    const factor = VOLT_FACTORS[normalizeUnitName(trace.units.y)] ?? 1;
    const key = fftCacheKey(trace, factor, range, p);
    const cached = trace.data.length >= FFT_CACHE_MIN_POINTS ? fftOutputCache.get(trace.data) : undefined;
    if (cached && cached.key === key) return cached.outputs;
    const outcome = computeFft(samplesInRange(trace, range, factor), { window: windowSpecOf(p), points: pointsOf(p), scale: p.scale, impedance: p.impedance, averaging: p.averaging, detrend: p.detrend });
    if (!outcome.ok) {
      if (trace.data.length >= FFT_CACHE_MIN_POINTS) {
        fftOutputCache.set(trace.data, { key, capability: denied(outcome.reason), outputs: [] });
      }
      return [];
    }
    const r = outcome.result, facts = r.facts;
    // The created trace carries what Harmonics needs to read tone power and noise exactly.
    const fft = { enbw: facts.enbw, lobe: facts.lobe, binHz: r.binHz, sampleRate: r.sampleRate };
    const spectrum = derived(trace, r.spectrum, 'derived', { ...p, transform: 'fft', points: r.points, fft });
    const outputs: readonly AnalysisOutput[] = [
      { type: 'numbers', values: {
        fundamentalHz: r.fundamental?.freq ?? NaN, fundamentalLevel: r.fundamental?.level ?? NaN,
        binHz: r.binHz, points: r.points, segments: r.segments,
        enbw: facts.enbw, enbwHz: facts.enbw * r.binHz, cgDb: facts.coherentGainDb, scallopDb: facts.scallopDb, sidelobeDb: facts.sidelobeDb,
      } },
      { type: 'trace', trace: { ...spectrum, domain: 'frequency', family: 'spectrum', isUniform: true, units: { x: 'Hz', y: FFT_SCALE_UNITS[p.scale] } } },
    ];
    if (trace.data.length >= FFT_CACHE_MIN_POINTS) {
      fftOutputCache.set(trace.data, { key, capability: allowed, outputs });
    }
    return outputs;
  },
};
