// Windowed FFT of a time trace, single-sided and RMS-scaled: pure, no React.
// Scaling: a bin reads √2·|X_k| / Σw (V RMS), so a bin-centred tone reads its RMS value with any window.
// The tone level sums the power over the window's main lobe and divides by the equivalent noise bandwidth,
// which removes scalloping loss for tones between bins. Density scales divide each bin by ENBW·Δf instead.
// Measurements read off a spectrum (harmonics, THD, SNR …) live in tone-metrics.ts, not here.
import type { DataPoint } from '../../types/trace';
import { findFundamental, tonePowerAt, toneCentre } from './tone-metrics';

export type FftWindow =
  | 'rectangular' | 'hann' | 'hamming' | 'blackman' | 'blackman-harris' | 'nuttall' | 'blackman-nuttall' | 'flattop'
  | 'kaiser' | 'gaussian' | 'tukey' | 'chebyshev';

/** A window and its own setting: Blackman-Harris terms, Kaiser β, Gaussian σ (of N/2), Tukey α, Chebyshev sidelobe level. */
export interface WindowSpec {
  readonly kind: FftWindow;
  readonly terms?: 3 | 4 | 7;
  readonly beta?: number;
  readonly sigma?: number;
  readonly alpha?: number;
  readonly sidelobeDb?: number;
}

export type FftScale = 'dbv' | 'v' | 'dbm' | 'dbmv' | 'dbuv' | 'dbvhz' | 'vrthz' | 'dbmhz';
export type FftAveraging = 'off' | 'avg4' | 'avg16' | 'avg64' | 'max';
export type FftDetrend = 'off' | 'dc' | 'linear';

export interface FftOptions {
  readonly window: FftWindow | WindowSpec;
  /** 'auto' takes every sample in range (no averaging) or the longest segment that fits (averaging). */
  readonly points: 'auto' | number;
  readonly scale: FftScale;
  /** Load for dBm and dBm/Hz, in ohms. */
  readonly impedance?: number;
  readonly averaging?: FftAveraging;
  readonly detrend?: FftDetrend;
}

export interface WindowFacts {
  /** Mean of the window (linear) and in dB. */
  readonly coherentGain: number;
  readonly coherentGainDb: number;
  /** Equivalent noise bandwidth, in bins. */
  readonly enbw: number;
  /** Level lost by a tone halfway between bins, in dB (positive). */
  readonly scallopDb: number;
  /** Highest sidelobe relative to the main lobe, in dB (negative). */
  readonly sidelobeDb: number;
  /** Half-width of the main lobe to its first null, in bins. */
  readonly mainLobeBins: number;
  /** Bins summed each side of a tone's peak for its level. */
  readonly lobe: number;
}

export interface FftResult {
  /** Points per transform (segment length when averaging). */
  readonly points: number;
  readonly segments: number;
  readonly binHz: number;
  readonly sampleRate: number;
  readonly facts: WindowFacts;
  /** Per-bin RMS power in V², bins 0 … ⌊N/2⌋ (averaged, or max-held). */
  readonly power: Float64Array;
  /** The level per bin in the chosen scale. */
  readonly spectrum: DataPoint[];
  /** Level in the tone unit of the scale (a density scale reads tones in its power unit). */
  readonly fundamental: { readonly freq: number; readonly rms: number; readonly level: number } | null;
}

export type FftOutcome = { readonly ok: true; readonly result: FftResult } | { readonly ok: false; readonly reason: string };

export const UNEVEN_SAMPLES = 'FFT needs evenly spaced samples';
const STEP_TOLERANCE = 0.01;
const MIN_POINTS = 8;
/** Below these the levels are clamped, so the created trace stays finite (−300 dBV). */
const FLOOR_VRMS = 1e-15;
const FLOOR_DENSITY = 1e-30;

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

/** Cosine-sum coefficients a0, a1, …: w = a0 − a1 cos(2πn/N) + a2 cos(4πn/N) − … */
const COSINE_SUMS: Readonly<Record<string, readonly number[]>> = {
  rectangular: [1],
  hann: [0.5, 0.5],
  hamming: [0.54, 0.46],
  blackman: [0.42, 0.5, 0.08],
  'blackman-harris-3': [0.42323, 0.49755, 0.07922],
  'blackman-harris-4': [0.35875, 0.48829, 0.14128, 0.01168],
  'blackman-harris-7': [0.27105140069342, 0.43329793923448, 0.21812299954311, 0.06592544638803, 0.01081174209837, 0.00077658482522, 0.00001388721735],
  nuttall: [0.355768, 0.487396, 0.144232, 0.012604],
  'blackman-nuttall': [0.3635819, 0.4891775, 0.1365995, 0.0106411],
  flattop: [0.21557895, 0.41663158, 0.277263158, 0.083578947, 0.006947368],
};

const specOf = (window: FftWindow | WindowSpec): WindowSpec => typeof window === 'string' ? { kind: window } : window;
const cosineKey = (spec: WindowSpec): string | null => spec.kind === 'blackman-harris' ? `blackman-harris-${spec.terms ?? 4}` : COSINE_SUMS[spec.kind] ? spec.kind : null;

/** Modified Bessel function of the first kind, order 0 (power series). */
function besselI0(x: number): number {
  let sum = 1, term = 1;
  const q = (x * x) / 4;
  for (let k = 1; k < 500; k++) {
    term *= q / (k * k);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return sum;
}

/** Symmetric Dolph-Chebyshev window of length m (the scipy construction), peak 1. */
function chebyshevSymmetric(m: number, sidelobeDb: number): Float64Array {
  const order = m - 1;
  const beta = Math.cosh(Math.acosh(10 ** (Math.abs(sidelobeDb) / 20)) / order);
  const re = new Float64Array(m), im = new Float64Array(m);
  for (let k = 0; k < m; k++) {
    const x = beta * Math.cos((Math.PI * k) / m);
    const p = x > 1 ? Math.cosh(order * Math.acosh(x)) : x < -1 ? (2 * (m % 2) - 1) * Math.cosh(order * Math.acosh(-x)) : Math.cos(order * Math.acos(x));
    if (m % 2) { re[k] = p; } else { re[k] = p * Math.cos((Math.PI * k) / m); im[k] = p * Math.sin((Math.PI * k) / m); }
  }
  fftAny(re, im);
  const w = new Float64Array(m);
  if (m % 2) {
    const n = (m + 1) / 2;
    for (let i = 0; i < m; i++) w[i] = re[Math.abs(i - (n - 1))] ?? 0;
  } else {
    const n = m / 2 + 1;
    for (let i = 0; i < m; i++) w[i] = re[i < n - 1 ? n - 1 - i : i - (n - 2)] ?? 0;
  }
  let max = 0;
  for (const v of w) max = Math.max(max, v);
  return w.map(v => v / max);
}

/** Periodic (DFT-even) window of length n. */
export function windowCoefficients(window: FftWindow | WindowSpec, n: number): Float64Array {
  const spec = specOf(window);
  const w = new Float64Array(n);
  const key = cosineKey(spec);
  if (key) {
    const coefficients = COSINE_SUMS[key] ?? [1];
    for (let i = 0; i < n; i++) {
      let value = 0;
      coefficients.forEach((a, k) => { value += (k % 2 === 0 ? a : -a) * Math.cos((2 * Math.PI * k * i) / n); });
      w[i] = value;
    }
    return w;
  }
  if (spec.kind === 'kaiser') {
    const beta = spec.beta ?? 8.6, norm = besselI0(beta);
    for (let i = 0; i < n; i++) { const x = (2 * i) / n - 1; w[i] = besselI0(beta * Math.sqrt(Math.max(0, 1 - x * x))) / norm; }
    return w;
  }
  if (spec.kind === 'gaussian') {
    const sigma = (spec.sigma ?? 0.4) * (n / 2);
    for (let i = 0; i < n; i++) w[i] = Math.exp(-0.5 * ((i - n / 2) / sigma) ** 2);
    return w;
  }
  if (spec.kind === 'tukey') {
    const alpha = spec.alpha ?? 0.5;
    for (let i = 0; i < n; i++) {
      const x = i / n;
      w[i] = alpha <= 0 ? 1 : x < alpha / 2 ? 0.5 * (1 - Math.cos((2 * Math.PI * x) / alpha)) : x <= 1 - alpha / 2 ? 1 : 0.5 * (1 - Math.cos((2 * Math.PI * (1 - x)) / alpha));
    }
    return w;
  }
  // Chebyshev stays symmetric: its end samples are spikes, and dropping one (the periodic form) breaks the equal sidelobes.
  return chebyshevSymmetric(n, spec.sidelobeDb ?? 100);
}

/** Coherent gain, ENBW and scalloping at length n; sidelobe level and lobe width from a fine spectrum of the same shape. */
export function windowFacts(window: FftWindow | WindowSpec, n: number): WindowFacts {
  const spec = specOf(window);
  const w = windowCoefficients(spec, n);
  let s1 = 0, s2 = 0, hr = 0, hi = 0;
  for (let i = 0; i < n; i++) {
    const v = w[i] ?? 0;
    s1 += v; s2 += v * v;
    hr += v * Math.cos((Math.PI * i) / n); hi -= v * Math.sin((Math.PI * i) / n);
  }
  const coherentGain = s1 / n;

  // Fine spectrum of a reference window (up to 1024 points, 16× zero padding).
  const length = Math.min(n, 1024), pad = 16, size = length * pad;
  const ref = windowCoefficients(spec, length);
  const re = new Float64Array(size), im = new Float64Array(size);
  re.set(ref);
  fftAny(re, im);
  const half = Math.floor(size / 2);
  const magnitude = (i: number) => Math.hypot(re[i] ?? 0, im[i] ?? 0);
  const peak = magnitude(0) || 1;

  // The main lobe ends at the first null. The flat top's main lobe crosses zero inside; its first true null is at K = 5 bins.
  const key = cosineKey(spec);
  let nullIndex = 1;
  if (spec.kind === 'flattop') nullIndex = Math.min(half, (COSINE_SUMS['flattop']?.length ?? 5) * pad);
  else while (nullIndex < half && magnitude(nullIndex + 1) < magnitude(nullIndex)) nullIndex++;
  let sidelobe = 0;
  for (let i = nullIndex; i <= half; i++) sidelobe = Math.max(sidelobe, magnitude(i));
  const mainLobeBins = nullIndex / pad;

  // Bins summed per tone: the main lobe, widened until a bin-centred tone keeps 99.9 % of its energy (Tukey, Gaussian).
  let lobe = Math.max(1, Math.ceil(mainLobeBins - 1e-9));
  if (!key) {
    let total = 0;
    for (let k = -Math.floor(length / 2); k < Math.ceil(length / 2); k++) total += magnitude(Math.abs(k) * pad) ** 2;
    const inside = (l: number) => { let sum = 0; for (let k = -l; k <= l; k++) sum += magnitude(Math.abs(k) * pad) ** 2; return sum; };
    while (lobe < 16 && inside(lobe) < 0.999 * total) lobe++;
  }

  return {
    coherentGain, coherentGainDb: 20 * Math.log10(coherentGain), enbw: (n * s2) / (s1 * s1),
    scallopDb: -20 * Math.log10(Math.hypot(hr, hi) / s1), sidelobeDb: 20 * Math.log10(Math.max(sidelobe, 1e-300) / peak),
    mainLobeBins, lobe,
  };
}

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

export function largestPowerOfTwo(n: number): number {
  if (!(n >= 1)) return 0;
  return 2 ** Math.floor(Math.log2(n));
}

const isPowerOfTwo = (n: number) => n > 0 && (n & (n - 1)) === 0;

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

/** In-place DFT of any length: radix-2 when it can, else Bluestein's chirp-z through a power-of-two FFT. */
export function fftAny(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n <= 1) return;
  if (isPowerOfTwo(n)) { fftInPlace(re, im); return; }
  const m = largestPowerOfTwo(2 * n - 1) * 2;
  // Chirp w_k = e^(−iπk²/n); k² is reduced mod 2n so the angle stays exact for long transforms.
  const cr = new Float64Array(n), ci = new Float64Array(n);
  for (let k = 0; k < n; k++) { const a = (Math.PI * ((k * k) % (2 * n))) / n; cr[k] = Math.cos(a); ci[k] = -Math.sin(a); }
  const ar = new Float64Array(m), ai = new Float64Array(m), br = new Float64Array(m), bi = new Float64Array(m);
  for (let k = 0; k < n; k++) {
    const xr = re[k] ?? 0, xi = im[k] ?? 0, wr = cr[k] ?? 0, wi = ci[k] ?? 0;
    ar[k] = xr * wr - xi * wi; ai[k] = xr * wi + xi * wr;
  }
  br[0] = cr[0] ?? 1; bi[0] = -(ci[0] ?? 0);
  for (let k = 1; k < n; k++) { br[k] = br[m - k] = cr[k] ?? 0; bi[k] = bi[m - k] = -(ci[k] ?? 0); }
  fftInPlace(ar, ai); fftInPlace(br, bi);
  for (let k = 0; k < m; k++) {
    const xr = ar[k] ?? 0, xi = ai[k] ?? 0, yr = br[k] ?? 0, yi = bi[k] ?? 0;
    ar[k] = xr * yr - xi * yi; ai[k] = xr * yi + xi * yr;
  }
  // Inverse through the forward transform of the conjugate.
  for (let k = 0; k < m; k++) ai[k] = -(ai[k] ?? 0);
  fftInPlace(ar, ai);
  for (let k = 0; k < n; k++) {
    const xr = (ar[k] ?? 0) / m, xi = -(ai[k] ?? 0) / m, wr = cr[k] ?? 0, wi = ci[k] ?? 0;
    re[k] = xr * wr - xi * wi; im[k] = xr * wi + xi * wr;
  }
}

// ---------------------------------------------------------------------------
// Samples and segments
// ---------------------------------------------------------------------------

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

const SEGMENT_COUNTS: Readonly<Record<FftAveraging, number>> = { off: 1, avg4: 4, avg16: 16, avg64: 64, max: 16 };

/** Split the samples in range into segments with 50 % overlap; one segment of everything without averaging. */
export function fftSegments(data: readonly DataPoint[], points: 'auto' | number, averaging: FftAveraging = 'off'): { ok: true; length: number; segments: DataPoint[][] } | { ok: false; reason: string } {
  const finite = data.filter(point => Number.isFinite(point.freq) && Number.isFinite(point.amp));
  const m = finite.length;
  const count = SEGMENT_COUNTS[averaging];
  if (count === 1) {
    if (m < MIN_POINTS) return { ok: false, reason: `FFT needs at least ${MIN_POINTS} samples in range.` };
    const length = points === 'auto' ? m : points;
    if (length > m) return { ok: false, reason: `Only ${m} samples in range: choose ${largestPowerOfTwo(m)} points or fewer, or Auto.` };
    const samples = finite.slice(0, length);
    return isEvenlySpaced(samples) ? { ok: true, length, segments: [samples] } : { ok: false, reason: UNEVEN_SAMPLES };
  }
  const length = points === 'auto' ? Math.floor((2 * m) / (count + 1)) : points;
  const hop = Math.floor(length / 2);
  const need = hop * (count - 1) + length;
  if (length < MIN_POINTS) return { ok: false, reason: `FFT needs at least ${MIN_POINTS} samples per segment: ${count} averages need ${Math.ceil(((count + 1) * MIN_POINTS) / 2)} samples in range.` };
  if (need > m) return { ok: false, reason: `Only ${m} samples in range: ${count} averages of ${length} points need ${need}.` };
  if (!isEvenlySpaced(finite.slice(0, need))) return { ok: false, reason: UNEVEN_SAMPLES };
  return { ok: true, length, segments: Array.from({ length: count }, (_, i) => finite.slice(i * hop, i * hop + length)) };
}

/** Subtract the mean, or the least-squares line, from the samples. */
function detrended(values: Float64Array, mode: FftDetrend): Float64Array {
  if (mode === 'off') return values;
  const n = values.length;
  let sy = 0;
  for (const v of values) sy += v;
  if (mode === 'dc') return values.map(v => v - sy / n);
  const mx = (n - 1) / 2;
  let sxy = 0, sxx = 0;
  values.forEach((v, i) => { sxy += (i - mx) * (v - sy / n); sxx += (i - mx) ** 2; });
  const slope = sxx > 0 ? sxy / sxx : 0;
  return values.map((v, i) => v - sy / n - slope * (i - mx));
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

export const FFT_SCALE_UNITS: Readonly<Record<FftScale, string>> = { dbv: 'dBV', v: 'V', dbm: 'dBm', dbmv: 'dBmV', dbuv: 'dBµV', dbvhz: 'dBV/Hz', vrthz: 'V/√Hz', dbmhz: 'dBm/Hz' };
/** The power unit a density scale reads tones in. */
export const FFT_TONE_SCALE: Readonly<Record<FftScale, FftScale>> = { dbv: 'dbv', v: 'v', dbm: 'dbm', dbmv: 'dbmv', dbuv: 'dbuv', dbvhz: 'dbv', vrthz: 'v', dbmhz: 'dbm' };
export const isDensityScale = (scale: FftScale): boolean => scale === 'dbvhz' || scale === 'vrthz' || scale === 'dbmhz';

/** A power (V² for a level, V²/Hz for a density) in the chosen scale. */
export function fftLevel(power: number, scale: FftScale, impedance = 50): number {
  const density = isDensityScale(scale);
  const p = Math.max(power, density ? FLOOR_DENSITY : FLOOR_VRMS ** 2);
  switch (scale) {
    case 'v': case 'vrthz': return Math.sqrt(Math.max(power, 0));
    case 'dbm': case 'dbmhz': return 10 * Math.log10(p / impedance / 1e-3);
    case 'dbmv': return 10 * Math.log10(p) + 60;
    case 'dbuv': return 10 * Math.log10(p) + 120;
    default: return 10 * Math.log10(p);
  }
}

/** Transform a time trace (x in seconds, y in volts). */
export function computeFft(data: readonly DataPoint[], options: FftOptions): FftOutcome {
  const chosen = fftSegments(data, options.points, options.averaging ?? 'off');
  if (!chosen.ok) return chosen;
  const { length: n, segments } = chosen;
  const first = segments[0]?.[0], last = segments[0]?.[n - 1];
  if (!first || !last) return { ok: false, reason: UNEVEN_SAMPLES };
  const dt = (last.freq - first.freq) / (n - 1);
  const sampleRate = 1 / dt, binHz = sampleRate / n;
  const spec = specOf(options.window);
  const w = windowCoefficients(spec, n);
  let s1 = 0;
  for (const v of w) s1 += v;
  const facts = windowFacts(spec, n);
  const half = Math.floor(n / 2);
  const maxHold = options.averaging === 'max';

  const power = new Float64Array(half + 1);
  for (const segment of segments) {
    const values = detrended(Float64Array.from(segment, point => point.amp), options.detrend ?? 'off');
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = (values[i] ?? 0) * (w[i] ?? 0);
    fftAny(re, im);
    for (let k = 0; k <= half; k++) {
      const mag2 = ((re[k] ?? 0) ** 2 + (im[k] ?? 0) ** 2) / (s1 * s1);
      // Interior bins carry both sides of the spectrum; DC and (even n) Nyquist do not.
      const p = k === 0 || (n % 2 === 0 && k === half) ? mag2 : 2 * mag2;
      power[k] = maxHold ? Math.max(power[k] ?? 0, p) : (power[k] ?? 0) + p / segments.length;
    }
  }

  const impedance = options.impedance ?? 50;
  const density = isDensityScale(options.scale);
  const toDensity = 1 / (facts.enbw * binHz);
  const spectrum = Array.from(power, (p, k) => ({ freq: k * binHz, amp: fftLevel(density ? p * toDensity : p, options.scale, impedance) }));

  const tones = { freqs: spectrum.map(point => point.freq), power: Array.from(power), fft: { enbw: facts.enbw, lobe: facts.lobe, sampleRate, binHz } };
  const peak = findFundamental(tones, null);
  const fundamental = peak === null ? null : (() => {
    const p1 = tonePowerAt(tones, peak);
    return { freq: toneCentre(tones, peak), rms: Math.sqrt(p1), level: fftLevel(p1, FFT_TONE_SCALE[options.scale], impedance) };
  })();

  return { ok: true, result: { points: n, segments: segments.length, binHz, sampleRate, facts, power, spectrum, fundamental } };
}
