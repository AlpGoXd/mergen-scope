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
    if (n > 0) {
      const a0 = coefficients[0] ?? 1;
      const half = n >> 1;
      const twoPiOverN = (2 * Math.PI) / n;
      let v0 = a0;
      for (let k = 1; k < coefficients.length; k++) {
        const a = coefficients[k] ?? 0;
        v0 += k % 2 === 0 ? a : -a;
      }
      w[0] = v0;
      for (let i = 1; i <= half; i++) {
        let value = a0;
        const baseAngle = twoPiOverN * i;
        for (let k = 1; k < coefficients.length; k++) {
          const a = coefficients[k] ?? 0;
          value += (k % 2 === 0 ? a : -a) * Math.cos(baseAngle * k);
        }
        w[i] = value;
        const mirror = n - i;
        if (mirror !== i) w[mirror] = value;
      }
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

function buildTwiddleTables(n: number): { cosTable: Float64Array; sinTable: Float64Array } {
  const half = n >> 1;
  const cosTable = new Float64Array(half);
  const sinTable = new Float64Array(half);
  const step = (-2 * Math.PI) / n;
  for (let k = 0; k < half; k++) {
    const angle = step * k;
    cosTable[k] = Math.cos(angle);
    sinTable[k] = Math.sin(angle);
  }
  return { cosTable, sinTable };
}

function fftRadix2WithTwiddle(re: Float64Array, im: Float64Array, cosTable: Float64Array, sinTable: Float64Array): void {
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
  if (n >= 2) {
    for (let a = 0; a < n; a += 2) {
      const b = a + 1;
      const ar = re[a] ?? 0, ai = im[a] ?? 0, br = re[b] ?? 0, bi = im[b] ?? 0;
      re[a] = ar + br; im[a] = ai + bi;
      re[b] = ar - br; im[b] = ai - bi;
    }
  }
  if (n >= 4) {
    for (let a = 0; a < n; a += 4) {
      const b = a + 2, c = a + 1, d = a + 3;
      let ar = re[a] ?? 0, ai = im[a] ?? 0, br = re[b] ?? 0, bi = im[b] ?? 0;
      re[a] = ar + br; im[a] = ai + bi;
      re[b] = ar - br; im[b] = ai - bi;
      ar = re[c] ?? 0; ai = im[c] ?? 0; br = re[d] ?? 0; bi = im[d] ?? 0;
      // Twiddle for size=4, k=1 is (0, -1): tr = bi, ti = -br.
      re[c] = ar + bi; im[c] = ai - br;
      re[d] = ar - bi; im[d] = ai + br;
    }
  }
  for (let size = 8; size <= n; size <<= 1) {
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

const SQRT3_2 = Math.sqrt(3) / 2;
const TAU = 2 * Math.PI;
const C5_1 = Math.cos(TAU / 5);
const S5_1 = Math.sin(TAU / 5);
const C5_2 = Math.cos((2 * TAU) / 5);
const S5_2 = Math.sin((2 * TAU) / 5);

function factorSmallRadices(n: number): number[] | null {
  const radices: number[] = [];
  let rem = n;
  while (rem % 4 === 0) { radices.push(4); rem /= 4; }
  while (rem % 2 === 0) { radices.push(2); rem /= 2; }
  while (rem % 3 === 0) { radices.push(3); rem /= 3; }
  while (rem % 5 === 0) { radices.push(5); rem /= 5; }
  return rem === 1 ? radices : null;
}

/** Stockham auto-sort mixed-radix FFT for smooth lengths (2^a * 3^b * 5^c). */
function fftSmooth(re: Float64Array, im: Float64Array, radices: readonly number[]): void {
  const n = re.length;
  let inR: Float64Array = re, inI: Float64Array = im;
  let outR: Float64Array = new Float64Array(n), outI: Float64Array = new Float64Array(n);
  let s = 1;

  for (let stage = 0; stage < radices.length; stage++) {
    const r = radices[stage] ?? 1;
    const rs = r * s;
    const q = n / rs;
    const qs = q * s;
    const angleStep = -TAU / rs;

    if (r === 2) {
      for (let j = 0; j < s; j++) {
        const a = angleStep * j;
        const w1r = Math.cos(a), w1i = Math.sin(a);
        for (let k = 0; k < q; k++) {
          const i0 = k * s + j;
          const i1 = i0 + qs;
          const x0r = inR[i0] ?? 0, x0i = inI[i0] ?? 0;
          const b1r = inR[i1] ?? 0, b1i = inI[i1] ?? 0;
          const x1r = b1r * w1r - b1i * w1i;
          const x1i = b1r * w1i + b1i * w1r;
          const o0 = k * rs + j;
          outR[o0] = x0r + x1r; outI[o0] = x0i + x1i;
          outR[o0 + s] = x0r - x1r; outI[o0 + s] = x0i - x1i;
        }
      }
    } else if (r === 4) {
      for (let j = 0; j < s; j++) {
        const a1 = angleStep * j;
        const w1r = Math.cos(a1), w1i = Math.sin(a1);
        const w2r = w1r * w1r - w1i * w1i, w2i = 2 * w1r * w1i;
        const w3r = w2r * w1r - w2i * w1i, w3i = w2r * w1i + w2i * w1r;
        for (let k = 0; k < q; k++) {
          const i0 = k * s + j;
          const i1 = i0 + qs, i2 = i1 + qs, i3 = i2 + qs;
          const x0r = inR[i0] ?? 0, x0i = inI[i0] ?? 0;
          const b1r = inR[i1] ?? 0, b1i = inI[i1] ?? 0;
          const b2r = inR[i2] ?? 0, b2i = inI[i2] ?? 0;
          const b3r = inR[i3] ?? 0, b3i = inI[i3] ?? 0;
          const x1r = b1r * w1r - b1i * w1i, x1i = b1r * w1i + b1i * w1r;
          const x2r = b2r * w2r - b2i * w2i, x2i = b2r * w2i + b2i * w2r;
          const x3r = b3r * w3r - b3i * w3i, x3i = b3r * w3i + b3i * w3r;
          const t0r = x0r + x2r, t0i = x0i + x2i;
          const t1r = x0r - x2r, t1i = x0i - x2i;
          const t2r = x1r + x3r, t2i = x1i + x3i;
          const t3r = x1r - x3r, t3i = x1i - x3i;
          const o0 = k * rs + j;
          outR[o0] = t0r + t2r; outI[o0] = t0i + t2i;
          outR[o0 + s] = t1r + t3i; outI[o0 + s] = t1i - t3r;
          outR[o0 + 2 * s] = t0r - t2r; outI[o0 + 2 * s] = t0i - t2i;
          outR[o0 + 3 * s] = t1r - t3i; outI[o0 + 3 * s] = t1i + t3r;
        }
      }
    } else if (r === 3) {
      for (let j = 0; j < s; j++) {
        const a1 = angleStep * j;
        const w1r = Math.cos(a1), w1i = Math.sin(a1);
        const w2r = w1r * w1r - w1i * w1i, w2i = 2 * w1r * w1i;
        for (let k = 0; k < q; k++) {
          const i0 = k * s + j;
          const i1 = i0 + qs, i2 = i1 + qs;
          const x0r = inR[i0] ?? 0, x0i = inI[i0] ?? 0;
          const b1r = inR[i1] ?? 0, b1i = inI[i1] ?? 0;
          const b2r = inR[i2] ?? 0, b2i = inI[i2] ?? 0;
          const x1r = b1r * w1r - b1i * w1i, x1i = b1r * w1i + b1i * w1r;
          const x2r = b2r * w2r - b2i * w2i, x2i = b2r * w2i + b2i * w2r;
          const tr = x1r + x2r, ti = x1i + x2i;
          const mr = x0r - 0.5 * tr, mi = x0i - 0.5 * ti;
          const dr = SQRT3_2 * (x1i - x2i), di = -SQRT3_2 * (x1r - x2r);
          const o0 = k * rs + j;
          outR[o0] = x0r + tr; outI[o0] = x0i + ti;
          outR[o0 + s] = mr + dr; outI[o0 + s] = mi + di;
          outR[o0 + 2 * s] = mr - dr; outI[o0 + 2 * s] = mi - di;
        }
      }
    } else if (r === 5) {
      for (let j = 0; j < s; j++) {
        const a1 = angleStep * j;
        const w1r = Math.cos(a1), w1i = Math.sin(a1);
        const w2r = w1r * w1r - w1i * w1i, w2i = 2 * w1r * w1i;
        const w3r = w2r * w1r - w2i * w1i, w3i = w2r * w1i + w2i * w1r;
        const w4r = w2r * w2r - w2i * w2i, w4i = 2 * w2r * w2i;
        for (let k = 0; k < q; k++) {
          const i0 = k * s + j;
          const i1 = i0 + qs, i2 = i1 + qs, i3 = i2 + qs, i4 = i3 + qs;
          const x0r = inR[i0] ?? 0, x0i = inI[i0] ?? 0;
          const b1r = inR[i1] ?? 0, b1i = inI[i1] ?? 0;
          const b2r = inR[i2] ?? 0, b2i = inI[i2] ?? 0;
          const b3r = inR[i3] ?? 0, b3i = inI[i3] ?? 0;
          const b4r = inR[i4] ?? 0, b4i = inI[i4] ?? 0;
          const x1r = b1r * w1r - b1i * w1i, x1i = b1r * w1i + b1i * w1r;
          const x2r = b2r * w2r - b2i * w2i, x2i = b2r * w2i + b2i * w2r;
          const x3r = b3r * w3r - b3i * w3i, x3i = b3r * w3i + b3i * w3r;
          const x4r = b4r * w4r - b4i * w4i, x4i = b4r * w4i + b4i * w4r;
          const s1r = x1r + x4r, s1i = x1i + x4i;
          const d1r = x1r - x4r, d1i = x1i - x4i;
          const s2r = x2r + x3r, s2i = x2i + x3i;
          const d2r = x2r - x3r, d2i = x2i - x3i;
          const o0 = k * rs + j;
          outR[o0] = x0r + s1r + s2r;
          outI[o0] = x0i + s1i + s2i;
          const m1r = x0r + C5_1 * s1r + C5_2 * s2r;
          const m1i = x0i + C5_1 * s1i + C5_2 * s2i;
          const m2r = x0r + C5_2 * s1r + C5_1 * s2r;
          const m2i = x0i + C5_2 * s1i + C5_1 * s2i;
          const n1r = S5_1 * d1i + S5_2 * d2i;
          const n1i = -(S5_1 * d1r + S5_2 * d2r);
          const n2r = S5_2 * d1i - S5_1 * d2i;
          const n2i = -(S5_2 * d1r - S5_1 * d2r);
          outR[o0 + s] = m1r + n1r; outI[o0 + s] = m1i + n1i;
          outR[o0 + 4 * s] = m1r - n1r; outI[o0 + 4 * s] = m1i - n1i;
          outR[o0 + 2 * s] = m2r + n2r; outI[o0 + 2 * s] = m2i + n2i;
          outR[o0 + 3 * s] = m2r - n2r; outI[o0 + 3 * s] = m2i - n2i;
        }
      }
    }
    const tmpR = inR, tmpI = inI;
    inR = outR; inI = outI;
    outR = tmpR; outI = tmpI;
    s = rs;
  }
  if (inR !== re) {
    re.set(inR);
    im.set(inI);
  }
}

/** In-place iterative radix-2 FFT; the length must be a power of two. */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const { cosTable, sinTable } = buildTwiddleTables(re.length);
  fftRadix2WithTwiddle(re, im, cosTable, sinTable);
}

/** In-place DFT of any length: radix-2 when it can, mixed-radix for 5-smooth sizes, else Bluestein's chirp-z. */
export function fftAny(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n <= 1) return;
  if (isPowerOfTwo(n)) { fftInPlace(re, im); return; }
  const radices = factorSmallRadices(n);
  if (radices) { fftSmooth(re, im, radices); return; }
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
  const { cosTable, sinTable } = buildTwiddleTables(m);
  fftRadix2WithTwiddle(ar, ai, cosTable, sinTable);
  fftRadix2WithTwiddle(br, bi, cosTable, sinTable);
  for (let k = 0; k < m; k++) {
    const xr = ar[k] ?? 0, xi = ai[k] ?? 0, yr = br[k] ?? 0, yi = bi[k] ?? 0;
    ar[k] = xr * yr - xi * yi; ai[k] = xr * yi + xi * yr;
  }
  // Inverse through the forward transform of the conjugate.
  for (let k = 0; k < m; k++) ai[k] = -(ai[k] ?? 0);
  fftRadix2WithTwiddle(ar, ai, cosTable, sinTable);
  for (let k = 0; k < n; k++) {
    const xr = (ar[k] ?? 0) / m, xi = -(ai[k] ?? 0) / m, wr = cr[k] ?? 0, wi = ci[k] ?? 0;
    re[k] = xr * wr - xi * wi; im[k] = xr * wi + xi * wr;
  }
}

// ---------------------------------------------------------------------------
// Samples and segments
// ---------------------------------------------------------------------------

function isEvenlySpacedPrefix(data: readonly DataPoint[], len: number): boolean {
  const count = len - 1;
  if (count < 1) return false;
  const first = data[0], second = data[1];
  if (!first || !second) return false;
  const step0 = second.freq - first.freq;
  if (!(step0 > 0) || !Number.isFinite(step0)) return false;

  // Uniformly sampled traces pass in one zero-allocation sweep.
  let uniform = true;
  for (let i = 1; i < len; i++) {
    const a = data[i - 1], b = data[i];
    if (!a || !b) return false;
    const step = b.freq - a.freq;
    if (!(step > 0) || !Number.isFinite(step)) return false;
    if (Math.abs(step - step0) > 1e-6 * step0) { uniform = false; break; }
  }
  if (uniform) return true;

  const steps = new Float64Array(count);
  for (let i = 1; i < len; i++) {
    const a = data[i - 1], b = data[i];
    if (!a || !b) return false;
    const step = b.freq - a.freq;
    if (!(step > 0) || !Number.isFinite(step)) return false;
    steps[i - 1] = step;
  }
  steps.sort();
  const median = steps[Math.floor(count / 2)] ?? 0;
  if (!(median > 0) || !Number.isFinite(median)) return false;
  for (let i = 0; i < count; i++) {
    if (!(Math.abs((steps[i] ?? 0) - median) <= STEP_TOLERANCE * median)) return false;
  }
  return true;
}

/** True when every step is within 1 % of the median step (and all steps are positive). */
export function isEvenlySpaced(data: readonly DataPoint[]): boolean {
  return isEvenlySpacedPrefix(data, data.length);
}

const SEGMENT_COUNTS: Readonly<Record<FftAveraging, number>> = { off: 1, avg4: 4, avg16: 16, avg64: 64, max: 16 };

function allFinitePoints(data: readonly DataPoint[]): boolean {
  for (let i = 0; i < data.length; i++) {
    const point = data[i];
    if (!point || !Number.isFinite(point.freq) || !Number.isFinite(point.amp)) return false;
  }
  return true;
}

type SegmentPlan =
  | { readonly ok: true; readonly length: number; readonly count: number; readonly hop: number; readonly finite: readonly DataPoint[] }
  | { readonly ok: false; readonly reason: string };

function resolveFftSegments(data: readonly DataPoint[], points: 'auto' | number, averaging: FftAveraging = 'off'): SegmentPlan {
  const finite = allFinitePoints(data)
    ? data
    : data.filter(point => Number.isFinite(point.freq) && Number.isFinite(point.amp));
  const m = finite.length;
  const count = SEGMENT_COUNTS[averaging];
  if (count === 1) {
    if (m < MIN_POINTS) return { ok: false, reason: `FFT needs at least ${MIN_POINTS} samples in range.` };
    const length = points === 'auto' ? m : points;
    if (length > m) return { ok: false, reason: `Only ${m} samples in range: choose ${largestPowerOfTwo(m)} points or fewer, or Auto.` };
    return isEvenlySpacedPrefix(finite, length)
      ? { ok: true, length, count: 1, hop: 0, finite }
      : { ok: false, reason: UNEVEN_SAMPLES };
  }
  const length = points === 'auto' ? Math.floor((2 * m) / (count + 1)) : points;
  const hop = Math.floor(length / 2);
  const need = hop * (count - 1) + length;
  if (length < MIN_POINTS) return { ok: false, reason: `FFT needs at least ${MIN_POINTS} samples per segment: ${count} averages need ${Math.ceil(((count + 1) * MIN_POINTS) / 2)} samples in range.` };
  if (need > m) return { ok: false, reason: `Only ${m} samples in range: ${count} averages of ${length} points need ${need}.` };
  if (!isEvenlySpacedPrefix(finite, need)) return { ok: false, reason: UNEVEN_SAMPLES };
  return { ok: true, length, count, hop, finite };
}

/** Check whether FFT segmentation succeeds on `data` (optionally clipped to `[left, right]`) without allocating output arrays. */
export function canComputeFftSegments(
  data: readonly DataPoint[],
  range: { readonly left: number; readonly right: number } | null | undefined,
  points: 'auto' | number,
  averaging: FftAveraging = 'off',
): { ok: true } | { ok: false; reason: string } {
  const hasRange = range !== null && range !== undefined
    && Number.isFinite(range.left) && Number.isFinite(range.right) && range.right >= range.left;
  if (!hasRange) {
    const plan = resolveFftSegments(data, points, averaging);
    return plan.ok ? { ok: true } : plan;
  }
  const left = range.left, right = range.right;
  const inRange: DataPoint[] = [];
  for (let i = 0; i < data.length; i++) {
    const point = data[i];
    if (point && Number.isFinite(point.freq) && Number.isFinite(point.amp) && point.freq >= left && point.freq <= right) {
      inRange.push(point);
    }
  }
  const plan = resolveFftSegments(inRange, points, averaging);
  return plan.ok ? { ok: true } : plan;
}

/** Split the samples in range into segments with 50 % overlap; one segment of everything without averaging. */
export function fftSegments(data: readonly DataPoint[], points: 'auto' | number, averaging: FftAveraging = 'off'): { ok: true; length: number; segments: DataPoint[][] } | { ok: false; reason: string } {
  const plan = resolveFftSegments(data, points, averaging);
  if (!plan.ok) return plan;
  if (plan.count === 1) {
    return { ok: true, length: plan.length, segments: [plan.finite.slice(0, plan.length)] };
  }
  return {
    ok: true,
    length: plan.length,
    segments: Array.from({ length: plan.count }, (_, i) => plan.finite.slice(i * plan.hop, i * plan.hop + plan.length)),
  };
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
  const chosen = resolveFftSegments(data, options.points, options.averaging ?? 'off');
  if (!chosen.ok) return chosen;
  const { length: n, count: segmentCount, hop, finite } = chosen;
  const first = finite[0], last = finite[n - 1];
  if (!first || !last) return { ok: false, reason: UNEVEN_SAMPLES };
  const dt = (last.freq - first.freq) / (n - 1);
  const sampleRate = 1 / dt, binHz = sampleRate / n;
  const spec = specOf(options.window);
  const w = windowCoefficients(spec, n);
  let s1 = 0;
  for (let i = 0; i < w.length; i++) s1 += w[i] ?? 0;
  const facts = windowFacts(spec, n);
  const half = Math.floor(n / 2);
  const maxHold = options.averaging === 'max';

  const power = new Float64Array(half + 1);
  const invS1Sq = 1 / (s1 * s1);
  const segScale = 1 / segmentCount;
  const raw = new Float64Array(n);
  for (let segIdx = 0; segIdx < segmentCount; segIdx++) {
    const startOffset = segIdx * hop;
    for (let i = 0; i < n; i++) raw[i] = finite[startOffset + i]?.amp ?? 0;
    const values = detrended(raw, options.detrend ?? 'off');
    if (n % 2 === 0 && n >= 4) {
      // Pack real even-length signal into a half-length complex transform z[j] = x[2j] + i·x[2j+1].
      const kLen = n >> 1;
      const zr = new Float64Array(kLen), zi = new Float64Array(kLen);
      for (let j = 0; j < kLen; j++) {
        const i0 = 2 * j;
        zr[j] = (values[i0] ?? 0) * (w[i0] ?? 0);
        zi[j] = (values[i0 + 1] ?? 0) * (w[i0 + 1] ?? 0);
      }
      fftAny(zr, zi);
      const dc = (((zr[0] ?? 0) + (zi[0] ?? 0)) ** 2) * invS1Sq;
      const nyq = (((zr[0] ?? 0) - (zi[0] ?? 0)) ** 2) * invS1Sq;
      power[0] = maxHold ? Math.max(power[0] ?? 0, dc) : (power[0] ?? 0) + dc * segScale;
      power[half] = maxHold ? Math.max(power[half] ?? 0, nyq) : (power[half] ?? 0) + nyq * segScale;
      const angleStep = (-2 * Math.PI) / n;
      for (let k = 1; k < half; k++) {
        const zkr = zr[k] ?? 0, zki = zi[k] ?? 0;
        const znr = zr[kLen - k] ?? 0, zni = -(zi[kLen - k] ?? 0);
        const er = 0.5 * (zkr + znr), ei = 0.5 * (zki + zni);
        const or = 0.5 * (zki - zni), oi = -0.5 * (zkr - znr);
        const angle = angleStep * k;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const xr = er + (or * cos - oi * sin);
        const xi = ei + (or * sin + oi * cos);
        const p = (2 * (xr * xr + xi * xi)) * invS1Sq;
        power[k] = maxHold ? Math.max(power[k] ?? 0, p) : (power[k] ?? 0) + p * segScale;
      }
    } else {
      const re = new Float64Array(n), im = new Float64Array(n);
      for (let i = 0; i < n; i++) re[i] = (values[i] ?? 0) * (w[i] ?? 0);
      fftAny(re, im);
      for (let k = 0; k <= half; k++) {
        const mag2 = ((re[k] ?? 0) ** 2 + (im[k] ?? 0) ** 2) * invS1Sq;
        // Interior bins carry both sides of the spectrum; DC and (even n) Nyquist do not.
        const p = k === 0 || (n % 2 === 0 && k === half) ? mag2 : 2 * mag2;
        power[k] = maxHold ? Math.max(power[k] ?? 0, p) : (power[k] ?? 0) + p * segScale;
      }
    }
  }

  const impedance = options.impedance ?? 50;
  const density = isDensityScale(options.scale);
  const toDensity = 1 / (facts.enbw * binHz);
  const spectrum = new Array<DataPoint>(half + 1);
  const freqs = new Float64Array(half + 1);
  for (let k = 0; k <= half; k++) {
    const freq = k * binHz;
    const p = power[k] ?? 0;
    freqs[k] = freq;
    spectrum[k] = { freq, amp: fftLevel(density ? p * toDensity : p, options.scale, impedance) };
  }

  const tones = { freqs, power, fft: { enbw: facts.enbw, lobe: facts.lobe, sampleRate, binHz } };
  const peak = findFundamental(tones, null);
  const fundamental = peak === null ? null : (() => {
    const p1 = tonePowerAt(tones, peak);
    return { freq: toneCentre(tones, peak), rms: Math.sqrt(p1), level: fftLevel(p1, FFT_TONE_SCALE[options.scale], impedance) };
  })();

  return { ok: true, result: { points: n, segments: segmentCount, binHz, sampleRate, facts, power, spectrum, fundamental } };
}
