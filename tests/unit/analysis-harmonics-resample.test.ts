import { describe, expect, it } from 'vitest';
import { FFT_DEFAULTS, fftTool } from '../../src/domain/analysis/tools/fft';
import { HARMONICS_DEFAULTS, harmonicsTool } from '../../src/domain/analysis/tools/harmonics';
import { resampleTool } from '../../src/domain/analysis/tools/resample';
import { resampleEven } from '../../src/domain/analysis/resample';
import { isEvenlySpaced } from '../../src/domain/analysis/fft';
import { computeInstance, createInstance, autoOutputName } from '../../src/domain/analysis/instances';
import { describeNumbers } from '../../src/domain/analysis/card-view';
import type { AnalysisOutput } from '../../src/types/registry-contract';
import type { DataPoint, Trace } from '../../src/types/trace';
import { makeTestTrace } from './helpers';

const sampled = (n: number, dt: number, f: (t: number, i: number) => number): DataPoint[] =>
  Array.from({ length: n }, (_, i) => ({ freq: i * dt, amp: f(i * dt, i) }));
function gaussian(seed: number): () => number {
  let s = seed >>> 0;
  const uniform = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());
}
const timeTrace = (data: DataPoint[]): Trace =>
  makeTestTrace({ id: 'ch1', name: 'scope.csv CH1 (V)_1', dn: 'scope.csv ch1 (v)', data, units: { x: 's', y: 'V' }, domain: 'time', family: 'waveform', file: 'scope.csv', isUniform: false });

/** FFT of a time trace, as the FFT card's created trace. */
function spectrumOf(data: DataPoint[], params: Partial<typeof FFT_DEFAULTS> = {}): Trace {
  const output = fftTool.compute({ traces: [timeTrace(data)] }, { ...FFT_DEFAULTS, range: 'all', ...params }).find(item => item.type === 'trace');
  if (output?.type !== 'trace') throw new Error('no spectrum');
  return { ...output.trace, id: 'fft', name: 'fft', dn: 'FFT · CH1', kind: 'derived', operationType: 'derived' } as Trace;
}
const numbersOf = (outputs: readonly AnalysisOutput[]): Readonly<Record<string, number>> => {
  const found = outputs.find(item => item.type === 'numbers');
  if (found?.type !== 'numbers') throw new Error('no numbers');
  return found.values;
};
const harmonics = (trace: Trace, params: Partial<typeof HARMONICS_DEFAULTS> = {}) => numbersOf(harmonicsTool.compute({ traces: [trace] }, { ...HARMONICS_DEFAULTS, ...params }));

const N = 8192, fs = 1e6, dt = 1 / fs, bin = fs / N;

describe('harmonics on an FFT spectrum', () => {
  it('reads the odd harmonics and THD of a square wave', () => {
    // ±1 V square, 64 samples per period: the sampled square has harmonic h at 2 / (M sin(π h / M)).
    const M = 64;
    const v = harmonics(spectrumOf(sampled(N, dt, (_t, i) => (i % M) < M / 2 ? 1 : -1)));
    const amplitude = (h: number) => 4 / (M * Math.sin((Math.PI * h) / M));
    expect(v['f0']).toBeCloseTo(fs / M, 6);
    expect(v['f0Level']).toBeCloseTo(20 * Math.log10(amplitude(1) / Math.SQRT2), 6);
    expect(v['h3']).toBeCloseTo(20 * Math.log10(amplitude(3) / amplitude(1)), 6);
    expect(v['h5']).toBeCloseTo(20 * Math.log10(amplitude(5) / amplitude(1)), 6);
    expect(v['h2']).toBeLessThan(-100);
    expect(v['h4']).toBeLessThan(-100);
    expect(v['thd']).toBeCloseTo((100 * Math.hypot(amplitude(3), amplitude(5))) / amplitude(1), 4);
    expect(v['count']).toBe(4);
  });

  it('reads SNR, SINAD, ENOB and THD+N of a sine with a −40 dBc second harmonic in white noise', () => {
    const next = gaussian(5), sigma = 1e-3, f0 = 211 * bin;
    const data = sampled(N, dt, t => Math.sin(2 * Math.PI * f0 * t) + 0.01 * Math.sin(2 * Math.PI * 2 * f0 * t) + sigma * next());
    const v = harmonics(spectrumOf(data));
    const signal = 0.5, distortion = 0.01 ** 2 / 2, noise = sigma ** 2;
    expect(v['h2']).toBeCloseTo(-40, 1);
    expect(Math.abs((v['snr'] ?? 0) - 10 * Math.log10(signal / noise))).toBeLessThan(0.3);
    const sinad = 10 * Math.log10(signal / (noise + distortion));
    expect(Math.abs((v['sinad'] ?? 0) - sinad)).toBeLessThan(0.3);
    expect(Math.abs((v['enob'] ?? 0) - (sinad - 1.76) / 6.02)).toBeLessThan(0.05);
    expect(Math.abs((v['thdn'] ?? 0) - 100 * Math.sqrt((noise + distortion) / signal))).toBeLessThan(0.05);
    // Mean noise per bin of white noise with Hann: 2σ²·1.5 / N.
    expect(Math.abs((v['noiseFloor'] ?? 0) - 10 * Math.log10((2 * sigma ** 2 * 1.5) / N))).toBeLessThan(0.3);
  });

  it('reads 12 effective bits from an ideal 12-bit quantised sine', () => {
    const f0 = 127 * bin;
    const v = harmonics(spectrumOf(sampled(N, dt, t => Math.round(2047 * Math.sin(2 * Math.PI * f0 * t)) / 2047)), { harmonics: 'h10' });
    expect(Math.abs((v['enob'] ?? 0) - 12)).toBeLessThan(0.15);
  });

  it('finds the largest spur for SFDR, harmonic or not', () => {
    const f0 = 300 * bin, spur = 1234 * bin;
    const data = sampled(N, dt, t => Math.sin(2 * Math.PI * f0 * t) + 10 ** (-70 / 20) * Math.sin(2 * Math.PI * spur * t) + 10 ** (-80 / 20) * Math.sin(2 * Math.PI * 2 * f0 * t));
    const v = harmonics(spectrumOf(data));
    expect(v['sfdr']).toBeCloseTo(70, 1);
    expect(v['spurHz']).toBeCloseTo(spur, 3);
  });

  it('folds harmonics above Nyquist back and marks them', () => {
    // f0 = 0.3 fs: H2 at 0.6 fs folds to 0.4 fs, H3 at 0.9 fs to 0.1 fs.
    const f0 = 2458 * bin;
    const data = sampled(N, dt, t => Math.sin(2 * Math.PI * f0 * t) + 0.01 * Math.sin(2 * Math.PI * 2 * f0 * t) + 10 ** (-50 / 20) * Math.sin(2 * Math.PI * 3 * f0 * t));
    const v = harmonics(spectrumOf(data));
    expect(v['h2Hz']).toBeCloseTo(fs - 2 * f0, 3);
    expect(v['h2Aliased']).toBe(1);
    expect(v['h2']).toBeCloseTo(-40, 1);
    expect(v['h3Hz']).toBeCloseTo(fs - 3 * f0, 3);
    expect(v['h3Aliased']).toBe(1);
    expect(v['h3']).toBeCloseTo(-50, 1);
  });

  it('reads the same THD from a density spectrum', () => {
    const f0 = 211 * bin;
    const data = sampled(N, dt, t => Math.sin(2 * Math.PI * f0 * t) + 0.01 * Math.sin(2 * Math.PI * 2 * f0 * t));
    expect(harmonics(spectrumOf(data, { scale: 'dbvhz' }))['thd']).toBeCloseTo(harmonics(spectrumOf(data))['thd'] ?? NaN, 6);
  });

  it('uses the tone near a chosen frequency instead of the largest one', () => {
    const f1 = 300 * bin, f2 = 1000 * bin;
    const data = sampled(N, dt, t => Math.sin(2 * Math.PI * f1 * t) + 0.1 * Math.sin(2 * Math.PI * f2 * t));
    expect(harmonics(spectrumOf(data))['f0']).toBeCloseTo(f1, 3);
    expect(harmonics(spectrumOf(data), { fundamental: 'near', fundamentalHz: 1.01 * f2 })['f0']).toBeCloseTo(f2, 3);
  });

  it('outlines the fundamental and harmonics with numbered triangles and the worst spur with a circle', () => {
    const f0 = 211 * bin;
    const outputs = harmonicsTool.compute({ traces: [spectrumOf(sampled(N, dt, t => Math.sin(2 * Math.PI * f0 * t) + 0.01 * Math.sin(2 * Math.PI * 2 * f0 * t)))] }, HARMONICS_DEFAULTS);
    const shapes = outputs.find(item => item.type === 'shapes');
    if (shapes?.type !== 'shapes') throw new Error('no shapes');
    expect(shapes.shapes.filter(shape => shape.kind === 'triangle').map(shape => shape.kind === 'triangle' ? shape.n : 0)).toEqual([1, 2, 3, 4, 5]);
    expect(shapes.shapes.filter(shape => shape.kind === 'dot')).toHaveLength(1);
  });
});

describe('harmonics on an analyzer spectrum', () => {
  // No FFT window information: tone levels are the peak bins, as a spectrum analyzer reads them.
  const freqs = Array.from({ length: 1001 }, (_, i) => i * 1e4);
  const peaks: Record<number, number> = { 1e6: 0, 2e6: -40, 3e6: -50 };
  const trace = makeTestTrace({ id: 'sa', name: 'sa', data: freqs.map(freq => ({ freq, amp: peaks[freq] ?? -100 })), units: { x: 'Hz', y: 'dBm' } });

  it('reads harmonics, THD and SFDR from peak levels; SNR needs FFT window information', () => {
    const v = harmonics(trace);
    expect(v['f0']).toBe(1e6);
    expect(v['f0Level']).toBeCloseTo(0, 9);
    expect(v['h2']).toBeCloseTo(-40, 9);
    expect(v['h3']).toBeCloseTo(-50, 9);
    // H4 and H5 sit on the −100 dBm floor and count too.
    expect(v['thd']).toBeCloseTo(100 * Math.sqrt(1e-4 + 1e-5 + 2e-10), 9);
    expect(v['sfdr']).toBeCloseTo(40, 9);
    expect(v['snr']).toBeNaN();
    expect(v['enob']).toBeNaN();
    expect(v['noiseFloor']).toBeCloseTo(-100, 6);
  });

  it('applies to spectrum traces only', () => {
    expect(harmonicsTool.appliesTo(trace)).toEqual({ allowed: true });
    expect(harmonicsTool.appliesTo(timeTrace(sampled(10, 1, () => 0)))).toEqual({ allowed: false, reason: 'Select a spectrum trace.' });
    expect(harmonicsTool.appliesTo(makeTestTrace({ family: 'network', units: { x: 'Hz', y: 'dB' } }))).toEqual({ allowed: false, reason: 'Select a spectrum trace.' });
  });

  it('formats the card', () => {
    const view = describeNumbers('harmonics', harmonicsTool.compute({ traces: [trace] }, HARMONICS_DEFAULTS), { x: 'Hz', y: 'dBm' });
    expect(view?.result).toMatchObject({ value: '1.05', unit: '%' });
    const row = (label: string) => view?.rows.find(item => item.label === label)?.value;
    expect(row('Fundamental')).toBe('1 MHz · 0 dBm');
    expect(row('H2')).toBe('−40 dBc');
    expect(row('SFDR')).toBe('40 dBc · 2 MHz');
    expect(row('SNR')).toBe('--');
  });
});

describe('resample', () => {
  // Timestamps jittered by up to ±20 % of the step.
  const next = gaussian(9);
  const jittered = (f: (t: number) => number) => Array.from({ length: 2000 }, (_, i) => { const t = (i + (i > 0 && i < 1999 ? 0.2 * Math.tanh(next()) : 0)) * 1e-6; return { freq: t, amp: f(t) }; });

  it('makes an evenly spaced copy with the same span and point count', () => {
    const ramp = jittered(t => 3 * t);
    const even = resampleEven(ramp, 'linear');
    expect(isEvenlySpaced(ramp)).toBe(false);
    expect(isEvenlySpaced(even)).toBe(true);
    expect(even).toHaveLength(2000);
    expect(even[0]?.freq).toBe(ramp[0]?.freq);
    expect(even[1999]?.freq).toBeCloseTo(ramp[1999]?.freq ?? NaN, 15);
    even.forEach(point => expect(point.amp).toBeCloseTo(3 * point.freq, 12));
  });

  it('cubic follows a smooth signal more closely than linear', () => {
    const f = (t: number) => Math.sin(2 * Math.PI * 20000 * t);
    const data = jittered(f);
    const error = (method: 'linear' | 'cubic') => Math.max(...resampleEven(data, method).map(point => Math.abs(point.amp - f(point.freq))));
    expect(error('cubic')).toBeLessThan(error('linear') / 5);
    expect(error('cubic')).toBeLessThan(1e-3);
  });

  it('creates a time trace that FFT accepts', () => {
    const source = timeTrace(jittered(t => Math.sin(2 * Math.PI * 20000 * t)));
    const output = resampleTool.compute({ traces: [source] }, { method: 'linear' }).find(item => item.type === 'trace');
    if (output?.type !== 'trace') throw new Error('no trace');
    expect(output.trace).toMatchObject({ domain: 'time', units: { x: 's', y: 'V' }, isUniform: true, sourceTraceIds: ['ch1'] });
    const fft = createInstance('analysis-1', 'fft', { traceId: 'ch1' });
    if (!fft) throw new Error('no instance');
    expect(computeInstance(fft, { traces: [source] })).toEqual({ reason: 'FFT needs evenly spaced samples' });
    expect(computeInstance(fft, { traces: [{ ...output.trace, id: 'ch1' }] }).reason).toBeUndefined();
  });

  it('applies to time traces and names its trace after the channel', () => {
    expect(resampleTool.appliesTo(makeTestTrace())).toEqual({ allowed: false, reason: 'Select a time trace.' });
    const instance = createInstance('analysis-1', 'resample', { traceId: 'ch1' });
    if (!instance) throw new Error('no instance');
    expect(autoOutputName(instance, [timeTrace([])])).toBe('CH1 · resampled');
  });
});
