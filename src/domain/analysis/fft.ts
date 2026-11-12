// Windowed FFT of a time trace, single-sided and RMS-scaled: pure, no React.
// Scaling: a bin reads √2·|X_k| / Σw (V RMS), so a bin-centred tone reads its RMS value with any window.
// Tone levels (fundamental, harmonics) sum the power over the window's main lobe and divide by the
// equivalent noise bandwidth, which removes scalloping loss for tones between bins.
import type { DataPoint } from '../../types/trace';

export type FftWindow = 'hann' | 'rectangular' | 'flattop' | 'blackman-harris';
export type FftScale = 'dbv' | 'v' | 'dbm';

export interface FftOptions {
  readonly window: FftWindow;
  /** 'auto' takes the largest power of two that fits the samples. */
  readonly points: 'auto' | number;
  readonly scale: FftScale;
}

export interface FftHarmonic {
  readonly order: number;
  readonly freq: number;
  /** Level relative to the fundamental. */
  readonly dBc: number;
}

export interface FftResult {
  readonly points: number;
  readonly binHz: number;
  /** Equivalent noise bandwidth of the window, in bins. */
  readonly enbw: number;
  /** Bins 0 … N/2, the level in the chosen scale. */
  readonly spectrum: DataPoint[];
  readonly fundamental: { readonly freq: number; readonly rms: number; readonly level: number } | null;
  /** Orders 2–5 that lie below Nyquist. */
  readonly harmonics: readonly FftHarmonic[];
  /** Total harmonic distortion over orders 2–5, in percent. */
  readonly thd: number | null;
  /** Mean noise level per bin, in the chosen scale (median-based, so spurs do not lift it). */
  readonly noiseFloor: number;
}

export type FftOutcome = { readonly ok: true; readonly result: FftResult } | { readonly ok: false; readonly reason: string };

export const UNEVEN_SAMPLES = 'FFT needs evenly spaced samples';
/** Largest allowed step deviation from the median step. */
const STEP_TOLERANCE = 0.01;
const MIN_POINTS = 8;
/** Below this the levels are clamped, so the created trace stays finite (−300 dBV). */
const FLOOR_VRMS = 1e-15;

/** Cosine-sum coefficients a0, a1, … of each window. */
const WINDOWS: Readonly<Record<FftWindow, { readonly coefficients: readonly number[]; readonly lobe: number }>> = {
  rectangular: { coefficients: [1], lobe: 1 },
  hann: { coefficients: [0.5, 0.5], lobe: 2 },
  'blackman-harris': { coefficients: [0.35875, 0.48829, 0.14128, 0.01168], lobe: 4 },
  flattop: { coefficients: [0.21557895, 0.41663158, 0.277263158, 0.083578947, 0.006947368], lobe: 5 },
};

/** Periodic (DFT-even) window of length n. */
export function windowCoefficients(kind: FftWindow, n: number): Float64Array {
  const { coefficients } = WINDOWS[kind];
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let value = 0;
    coefficients.forEach((a, k) => { value += (k % 2 === 0 ? a : -a) * Math.cos((2 * Math.PI * k * i) / n); });
    w[i] = value;
  }
  return w;
}

export function largestPowerOfTwo(n: number): number {
  if (!(n >= 1)) return 0;
  return 2 ** Math.floor(Math.log2(n));
}

/** In-place iterative radix-2 FFT; the length must be a power of two. */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i] ?? 0; re[i] = re[j] ?? 0; re[j] = tr;
      const ti = im[i] ?? 0; im[i] = im[j] ?? 0; im[j] = ti;
    }
  }
  // One twiddle table e^(−2πik/n); a stage of length `size` uses every (n/size)-th entry.
  const cosTable = new Float64Array(n >> 1), sinTable = new Float64Array(n >> 1);
  for (let k = 0; k < n >> 1; k++) { cosTable[k] = Math.cos((-2 * Math.PI * k) / n); sinTable[k] = Math.sin((-2 * Math.PI * k) / n); }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const stride = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const cos = cosTable[k * stride] ?? 1, sin = sinTable[k * stride] ?? 0;
        const a = start + k, b = a + half;
        const br = re[b] ?? 0, bi = im[b] ?? 0;
        const tr = br * cos - bi * sin, ti = br * sin + bi * cos;
        const ar = re[a] ?? 0, ai = im[a] ?? 0;
        re[b] = ar - tr; im[b] = ai - ti;
        re[a] = ar + tr; im[a] = ai + ti;
      }
    }
  }
}

/** True when every step is within 1 % of the median step (and all steps are positive). */
export function isEvenlySpaced(data: readonly DataPoint[]): boolean {
  const steps: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const a = data[i - 1], b = data[i];
    if (!a || !b) return false;
    steps.push(b.freq - a.freq);
  }
  if (!steps.length) return false;
  const sorted = [...steps].sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  if (!(median > 0) || !Number.isFinite(median)) return false;
  return steps.every(step => Math.abs(step - median) <= STEP_TOLERANCE * median);
}

/** An RMS voltage in the chosen scale. */
export function fftLevel(vrms: number, scale: FftScale): number {
  if (scale === 'v') return vrms;
  const v = Math.max(vrms, FLOOR_VRMS);
  return scale === 'dbv' ? 20 * Math.log10(v) : 10 * Math.log10((v * v) / 50 / 1e-3);
}

export const FFT_SCALE_UNITS: Readonly<Record<FftScale, string>> = { dbv: 'dBV', v: 'V', dbm: 'dBm' };

/** Choose the samples for the transform: the first N of the range. */
export function fftSamples(data: readonly DataPoint[], points: 'auto' | number): { ok: true; samples: DataPoint[] } | { ok: false; reason: string } {
  const finite = data.filter(point => Number.isFinite(point.freq) && Number.isFinite(point.amp));
  if (finite.length < MIN_POINTS) return { ok: false, reason: `FFT needs at least ${MIN_POINTS} samples in range.` };
  const fit = largestPowerOfTwo(finite.length);
  const n = points === 'auto' ? fit : points;
  if (n > finite.length) return { ok: false, reason: `Only ${finite.length} samples in range: choose ${fit} points or fewer, or Auto.` };
  const samples = finite.slice(0, n);
  return isEvenlySpaced(samples) ? { ok: true, samples } : { ok: false, reason: UNEVEN_SAMPLES };
}

/** Transform a time trace (x in seconds, y in volts). */
export function computeFft(data: readonly DataPoint[], options: FftOptions): FftOutcome {
  const chosen = fftSamples(data, options.points);
  if (!chosen.ok) return chosen;
  const samples = chosen.samples;
  const n = samples.length;
  const first = samples[0], last = samples[n - 1];
  if (!first || !last) return { ok: false, reason: UNEVEN_SAMPLES };
  const dt = (last.freq - first.freq) / (n - 1);
  const binHz = 1 / (n * dt);

  const w = windowCoefficients(options.window, n);
  const re = new Float64Array(n), im = new Float64Array(n);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < n; i++) {
    const wi = w[i] ?? 0;
    re[i] = (samples[i]?.amp ?? 0) * wi;
    s1 += wi; s2 += wi * wi;
  }
  fftInPlace(re, im);
  const enbw = (n * s2) / (s1 * s1);
  const half = n / 2;

  // Per-bin RMS power (V²): √2·|X|/Σw for interior bins, |X|/Σw at DC and Nyquist.
  const power = new Float64Array(half + 1);
  for (let k = 0; k <= half; k++) {
    const mag2 = ((re[k] ?? 0) ** 2 + (im[k] ?? 0) ** 2) / (s1 * s1);
    power[k] = k === 0 || k === half ? mag2 : 2 * mag2;
  }
  const p = (k: number) => power[k] ?? 0;
  const spectrum = Array.from(power, (value, k) => ({ freq: k * binHz, amp: fftLevel(Math.sqrt(value), options.scale) }));

  const lobe = WINDOWS[options.window].lobe;
  const lobeRange = (centre: number): [number, number] => [Math.max(1, centre - lobe), Math.min(half, centre + lobe)];
  const tonePower = (centre: number): number => {
    const [lo, hi] = lobeRange(centre);
    let sum = 0;
    for (let k = lo; k <= hi; k++) sum += p(k);
    return sum / enbw;
  };

  const excluded = new Uint8Array(half + 1);
  const exclude = (centre: number) => { const [lo, hi] = lobeRange(centre); for (let k = lo; k <= hi; k++) excluded[k] = 1; };
  for (let k = 0; k <= Math.min(half, lobe); k++) excluded[k] = 1;
  excluded[half] = 1;

  let peak = -1;
  for (let k = lobe + 1; k < half; k++) if (peak < 0 || p(k) > p(peak)) peak = k;
  let fundamental: FftResult['fundamental'] = null;
  const harmonics: FftHarmonic[] = [];
  let thd: number | null = null;
  if (peak > 0 && p(peak) > 0) {
    const [lo, hi] = lobeRange(peak);
    let weighted = 0, total = 0;
    for (let k = lo; k <= hi; k++) { weighted += k * p(k); total += p(k); }
    const centreBin = weighted / total;
    const p1 = tonePower(peak);
    const rms = Math.sqrt(p1);
    fundamental = { freq: centreBin * binHz, rms, level: fftLevel(rms, options.scale) };
    exclude(peak);
    let distortion = 0;
    for (let order = 2; order <= 5; order++) {
      const target = Math.round(order * centreBin);
      if (target + lobe >= half) break;
      let at = target;
      for (const k of [target - 1, target + 1]) if (p(k) > p(at)) at = k;
      const ph = tonePower(at);
      distortion += ph;
      exclude(at);
      harmonics.push({ order, freq: order * centreBin * binHz, dBc: 10 * Math.log10(Math.max(ph, 1e-300) / p1) });
    }
    thd = harmonics.length ? 100 * Math.sqrt(distortion / p1) : null;
  }

  // |X|² of noise is exponentially distributed: mean = median / ln 2.
  const rest: number[] = [];
  for (let k = 0; k <= half; k++) if (!excluded[k]) rest.push(p(k));
  rest.sort((a, b) => a - b);
  const median = rest[Math.floor(rest.length / 2)];
  const noiseFloor = median === undefined ? NaN : fftLevel(Math.sqrt(median / Math.LN2), options.scale);

  return { ok: true, result: { points: n, binHz, enbw, spectrum, fundamental, harmonics, thd, noiseFloor } };
}
