import { describe, expect, it } from 'vitest';
import { computeFft, fftAny, windowCoefficients, windowFacts } from '../../src/domain/analysis/fft';
import type { FftOptions, WindowSpec } from '../../src/domain/analysis/fft';
import type { DataPoint } from '../../src/types/trace';

const sampled = (n: number, dt: number, f: (t: number, i: number) => number): DataPoint[] =>
  Array.from({ length: n }, (_, i) => ({ freq: i * dt, amp: f(i * dt, i) }));
const sine = (n: number, dt: number, freq: number, amplitude = 1, phase = 0): DataPoint[] =>
  sampled(n, dt, t => amplitude * Math.sin(2 * Math.PI * freq * t + phase));
function gaussian(seed: number): () => number {
  let s = seed >>> 0;
  const uniform = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());
}
const dBV = (vrms: number) => 20 * Math.log10(vrms);
const level = (options: Partial<FftOptions> & Pick<FftOptions, 'window'>, data: DataPoint[]) => {
  const r = computeFft(data, { points: 'auto', scale: 'dbv', ...options });
  if (!r.ok) throw new Error(r.reason);
  return r.result;
};

/** Every window with its default setting, plus the Blackman-Harris term counts. */
const ALL_WINDOWS: readonly WindowSpec[] = [
  { kind: 'rectangular' }, { kind: 'hann' }, { kind: 'hamming' }, { kind: 'blackman' },
  { kind: 'blackman-harris', terms: 3 }, { kind: 'blackman-harris', terms: 4 }, { kind: 'blackman-harris', terms: 7 },
  { kind: 'nuttall' }, { kind: 'blackman-nuttall' }, { kind: 'flattop' },
  { kind: 'kaiser', beta: 8.6 }, { kind: 'gaussian', sigma: 0.4 }, { kind: 'tukey', alpha: 0.5 }, { kind: 'chebyshev', sidelobeDb: 100 },
];
/** Windows with low, fast-falling sidelobes: their tone level holds between bins. */
const TAPERED: readonly WindowSpec[] = ALL_WINDOWS.filter(spec => !['rectangular', 'tukey'].includes(spec.kind));
const name = (spec: WindowSpec) => `${spec.kind}${spec.terms ? ` ${spec.terms}-term` : ''}`;

describe('window facts against published values', () => {
  // ENBW in bins, scalloping loss in dB, highest sidelobe in dB (Harris 1978; Heinzel, Rüdiger and Schilling 2002).
  it.each([
    [{ kind: 'rectangular' }, 1, 3.92, -13.26],
    [{ kind: 'hann' }, 1.5, 1.42, -31.47],
    [{ kind: 'hamming' }, 1.3628, 1.75, -42.7],
    [{ kind: 'blackman' }, 1.7268, 1.10, -58.1],
    // Harris lists −67 dB for these 3-term coefficients; they reach −70.8 dB (Nuttall 1981 corrected the table).
    [{ kind: 'blackman-harris', terms: 3 }, 1.7086, 1.13, -70.8],
    [{ kind: 'blackman-harris', terms: 4 }, 2.0044, 0.83, -92.0],
    [{ kind: 'nuttall' }, 2.0212, 0.81, -93.3],
    [{ kind: 'blackman-nuttall' }, 1.9761, 0.81, -98.1],
  ] as const)('%o', (spec, enbw, scallop, sidelobe) => {
    const facts = windowFacts(spec, 4096);
    expect(facts.enbw).toBeCloseTo(enbw, 2);
    expect(Math.abs(facts.scallopDb - scallop)).toBeLessThan(0.05);
    expect(Math.abs(facts.sidelobeDb - sidelobe)).toBeLessThan(1);
  });

  it('flat top: ENBW 3.77 bins, almost no scalloping', () => {
    const facts = windowFacts({ kind: 'flattop' }, 4096);
    expect(facts.enbw).toBeCloseTo(3.7702, 3);
    expect(facts.scallopDb).toBeLessThan(0.02);
    expect(facts.sidelobeDb).toBeLessThan(-85);
  });

  it('7-term Blackman-Harris reaches very low sidelobes', () => {
    expect(windowFacts({ kind: 'blackman-harris', terms: 7 }, 4096).sidelobeDb).toBeLessThan(-160);
  });

  it('sums tones over the main lobe: 1 bin each side for Rectangular, 2 for Hann, 4 for 4-term Blackman-Harris, 5 for flat top', () => {
    expect(windowFacts({ kind: 'rectangular' }, 1024).lobe).toBe(1);
    expect(windowFacts({ kind: 'hann' }, 1024).lobe).toBe(2);
    expect(windowFacts({ kind: 'blackman-harris', terms: 4 }, 1024).lobe).toBe(4);
    expect(windowFacts({ kind: 'flattop' }, 1024).lobe).toBe(5);
  });
});

describe('window settings', () => {
  it('Kaiser: β = 0 is Rectangular; a larger β lowers the sidelobes and widens the lobe', () => {
    expect(windowFacts({ kind: 'kaiser', beta: 0 }, 1024).enbw).toBeCloseTo(1, 6);
    const [low, mid, high] = [4, 8, 12].map(beta => windowFacts({ kind: 'kaiser', beta }, 1024));
    if (!low || !mid || !high) throw new Error('missing facts');
    expect(mid.sidelobeDb).toBeLessThan(low.sidelobeDb);
    expect(high.sidelobeDb).toBeLessThan(mid.sidelobeDb);
    expect(high.enbw).toBeGreaterThan(mid.enbw);
  });

  it('Tukey: α = 0 is Rectangular, α = 1 is Hann', () => {
    expect(windowFacts({ kind: 'tukey', alpha: 0 }, 1024).enbw).toBeCloseTo(1, 6);
    const hann = windowCoefficients('hann', 1024), tukey = windowCoefficients({ kind: 'tukey', alpha: 1 }, 1024);
    expect(Math.max(...tukey.map((v, i) => Math.abs(v - (hann[i] ?? 0))))).toBeLessThan(1e-12);
  });

  it.each([60, 100])('Dolph-Chebyshev holds every sidelobe at −%i dB', db => {
    expect(Math.abs(windowFacts({ kind: 'chebyshev', sidelobeDb: db }, 1024).sidelobeDb + db)).toBeLessThan(0.5);
  });

  it('Gaussian: peaks at the centre and widens the lobe as σ shrinks', () => {
    const w = windowCoefficients({ kind: 'gaussian', sigma: 0.4 }, 1024);
    expect(w[512]).toBeCloseTo(1, 12);
    expect(w[256]).toBeCloseTo(w[768] ?? NaN, 12);
    expect(windowFacts({ kind: 'gaussian', sigma: 0.25 }, 1024).enbw).toBeGreaterThan(windowFacts({ kind: 'gaussian', sigma: 0.5 }, 1024).enbw);
  });
});

describe('window corrections', () => {
  const N = 4096, fs = 1e6, dt = 1 / fs, bin = fs / N;
  it.each(ALL_WINDOWS.map(spec => [name(spec), spec] as const))('a 1 V amplitude sine reads −3.01 dBV with %s (bin-centred)', (_label, spec) => {
    const r = level({ window: spec }, sine(N, dt, 100 * bin));
    expect(Math.abs((r.fundamental?.level ?? 0) - dBV(Math.SQRT1_2))).toBeLessThan(0.1);
  });
  it.each(TAPERED.map(spec => [name(spec), spec] as const))('and within 0.1 dB between bins with %s', (_label, spec) => {
    const r = level({ window: spec }, sine(N, dt, 100.37 * bin, 1, 0.3));
    expect(Math.abs((r.fundamental?.level ?? 0) - dBV(Math.SQRT1_2))).toBeLessThan(0.1);
  });
});

describe('transform of any length', () => {
  const naive = (re: number[], im: number[]) => re.map((_, k) => {
    let sr = 0, si = 0;
    re.forEach((x, n) => { const a = (-2 * Math.PI * k * n) / re.length; sr += x * Math.cos(a) - (im[n] ?? 0) * Math.sin(a); si += x * Math.sin(a) + (im[n] ?? 0) * Math.cos(a); });
    return [sr, si] as const;
  });
  it.each([12, 97, 256])('matches the direct DFT for %i points', n => {
    const next = gaussian(n);
    const re = Array.from({ length: n }, () => next()), im = Array.from({ length: n }, () => next());
    const expected = naive(re, im);
    const fr = Float64Array.from(re), fi = Float64Array.from(im);
    fftAny(fr, fi);
    expected.forEach(([r, i], k) => { expect(fr[k]).toBeCloseTo(r, 9); expect(fi[k]).toBeCloseTo(i, 9); });
  });
});

describe('averaging and detrend', () => {
  const fs = 1e6, dt = 1 / fs;

  it('16 averages keep the noise level and narrow its spread', () => {
    const next = gaussian(3);
    const data = sampled(32768, dt, () => 0.01 * next());
    const spread = (r: ReturnType<typeof level>) => {
      const values = r.spectrum.slice(5, -5).map(point => point.amp);
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
    };
    const density = (averaging: FftOptions['averaging']) => level({ window: 'hann', scale: 'dbvhz', averaging }, data);
    const single = density('off'), averaged = density('avg16');
    expect(averaged.segments).toBe(16);
    expect(spread(averaged)).toBeLessThan(spread(single) / 2.5);
    // White noise density is 2σ²/fs, single-sided.
    const expected = 10 * Math.log10((2 * 0.01 ** 2) / fs);
    const median = (r: ReturnType<typeof level>) => { const v = r.spectrum.slice(5).map(p => p.amp).sort((a, b) => a - b); return v[Math.floor(v.length / 2)] ?? NaN; };
    expect(Math.abs(median(averaged) - expected)).toBeLessThan(0.5);
  });

  it('a tone reads the same with averaging; Max hold never reads lower', () => {
    const data = sine(20000, dt, 12345, 1, 0.2);
    const avg = level({ window: 'hann', averaging: 'avg16' }, data);
    const max = level({ window: 'hann', averaging: 'max' }, data);
    expect(Math.abs((avg.fundamental?.level ?? 0) - dBV(Math.SQRT1_2))).toBeLessThan(0.1);
    max.spectrum.forEach((point, i) => expect(point.amp).toBeGreaterThanOrEqual((avg.spectrum[i]?.amp ?? Infinity) - 1e-9));
  });

  it('with a chosen point count, averaging needs enough samples', () => {
    const r = computeFft(sine(2000, dt, 1000), { window: 'hann', points: 1024, scale: 'dbv', averaging: 'avg4' });
    expect(r).toEqual({ ok: false, reason: 'Only 2000 samples in range: 4 averages of 1024 points need 2560.' });
  });

  it('removes a DC offset or a linear trend before the window', () => {
    const N = 4096, bin = fs / N;
    const offset = sampled(N, dt, t => 5 + Math.sin(2 * Math.PI * 100 * bin * t));
    const raw = level({ window: 'hann' }, offset), dc = level({ window: 'hann', detrend: 'dc' }, offset);
    expect((raw.spectrum[0]?.amp ?? 0) - (dc.spectrum[0]?.amp ?? 0)).toBeGreaterThan(60);
    expect(dc.fundamental?.level).toBeCloseTo(raw.fundamental?.level ?? NaN, 6);
    const ramp = sampled(N, dt, (t, i) => i / N + Math.sin(2 * Math.PI * 100 * bin * t));
    const low = (r: ReturnType<typeof level>) => Math.max(...r.spectrum.slice(0, 4).map(p => p.amp));
    expect(low(level({ window: 'hann', detrend: 'dc' }, ramp)) - low(level({ window: 'hann', detrend: 'linear' }, ramp))).toBeGreaterThan(30);
  });
});

describe('scales', () => {
  const N = 4096, fs = 1e6, dt = 1 / fs, bin = fs / N;
  const tone = sine(N, dt, 100 * bin);
  it('dBmV and dBµV are dBV + 60 and + 120; dBm follows the impedance', () => {
    const at = (scale: FftOptions['scale'], impedance?: number) => level({ window: 'hann', scale, ...(impedance ? { impedance } : {}) }, tone).fundamental?.level ?? NaN;
    expect(at('dbmv')).toBeCloseTo(at('dbv') + 60, 9);
    expect(at('dbuv')).toBeCloseTo(at('dbv') + 120, 9);
    expect(at('dbm', 75)).toBeCloseTo(at('dbm') - 10 * Math.log10(75 / 50), 9);
  });

  it.each(['hann', 'blackman-harris'] as const)('a density reads the same noise with any window (%s): 2σ²/fs', window => {
    const next = gaussian(11);
    const sigma = 0.01;
    const data = sampled(16384, dt, () => sigma * next());
    const mean = (scale: FftOptions['scale']) => { const v = level({ window, scale }, data).spectrum.slice(10); return v.reduce((s, p) => s + p.amp, 0) / v.length; };
    // Mean of V²/Hz is unbiased; compare in linear power.
    const vrthz = level({ window, scale: 'vrthz' }, data).spectrum.slice(10);
    const meanPower = vrthz.reduce((s, p) => s + p.amp ** 2, 0) / vrthz.length;
    expect(Math.abs(10 * Math.log10(meanPower) - 10 * Math.log10((2 * sigma ** 2) / fs))).toBeLessThan(0.2);
    expect(mean('dbmhz') - mean('dbvhz')).toBeCloseTo(10 * Math.log10(1 / 50 / 1e-3), 6);
  });
});
