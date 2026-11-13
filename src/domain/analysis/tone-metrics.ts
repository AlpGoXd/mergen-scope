// Single-tone measurements on a spectrum (IEEE 1241 style): fundamental, harmonics, THD, THD+N, SNR, SINAD,
// ENOB, SFDR and the noise floor. Pure, no React.
// Two ways to read a tone's power:
// - FFT spectrum (window facts known): sum the bins over the window's main lobe and divide by ENBW. Exact between
//   bins, and the noise in the other bins adds up to the true noise power, so SNR, SINAD and ENOB are defined.
// - Any other spectrum (a swept analyzer trace): the peak bin is the tone's power, as an analyzer reads it. The
//   noise bandwidth per bin is unknown, so SNR, SINAD, ENOB and THD+N are not given.

export interface ToneSpectrum {
  readonly freqs: readonly number[];
  /** Linear power per bin, in any consistent reference. */
  readonly power: readonly number[];
  /** Present when the spectrum is an FFT made by this app. */
  readonly fft: { readonly enbw: number; readonly lobe: number; readonly sampleRate: number; readonly binHz: number } | null;
}

export interface ToneHarmonic {
  readonly order: number;
  readonly freq: number;
  readonly index: number;
  readonly power: number;
  readonly dBc: number;
  /** Above Nyquist, folded back into the spectrum. */
  readonly aliased: boolean;
}

export interface ToneMetrics {
  readonly fundamental: { readonly index: number; readonly freq: number; readonly power: number };
  readonly harmonics: readonly ToneHarmonic[];
  /** Total harmonic distortion in percent, and in dB. */
  readonly thd: number;
  readonly thdDb: number;
  readonly spur: { readonly index: number; readonly freq: number; readonly power: number } | null;
  /** Fundamental over the largest other component, in dB. */
  readonly sfdr: number;
  /** Typical noise power per bin (median; corrected to the mean for FFT noise). */
  readonly noiseFloor: number;
  /** Null without FFT window information. */
  readonly snr: number | null;
  readonly sinad: number | null;
  readonly enob: number | null;
  /** THD + N in percent. */
  readonly thdn: number | null;
}

export interface ToneOptions {
  /** Highest harmonic order, or every harmonic below Nyquist. */
  readonly harmonics: number | 'all';
  /** Use the largest tone near this frequency instead of the largest tone overall. */
  readonly nearHz?: number | null;
}

const p = (spec: ToneSpectrum, i: number) => spec.power[i] ?? 0;
const last = (spec: ToneSpectrum) => spec.power.length - 1;

/** Typical bin spacing. */
function spacing(spec: ToneSpectrum): number {
  if (spec.fft) return spec.fft.binHz;
  const steps: number[] = [];
  for (let i = 1; i < spec.freqs.length; i++) steps.push((spec.freqs[i] ?? 0) - (spec.freqs[i - 1] ?? 0));
  steps.sort((a, b) => a - b);
  return steps[Math.floor(steps.length / 2)] ?? 1;
}

/** Bins that belong to the tone at `index`: the window's main lobe, or the hill of a peak. */
export function lobeOf(spec: ToneSpectrum, index: number): [number, number] {
  if (spec.fft) return [Math.max(0, index - spec.fft.lobe), Math.min(last(spec), index + spec.fft.lobe)];
  let lo = index, hi = index;
  while (lo > 0 && p(spec, lo - 1) < p(spec, lo)) lo--;
  while (hi < last(spec) && p(spec, hi + 1) < p(spec, hi)) hi++;
  return [lo, hi];
}

/** The tone's power: main-lobe sum over ENBW (FFT), else the peak bin. */
export function tonePowerAt(spec: ToneSpectrum, index: number): number {
  if (!spec.fft) return p(spec, index);
  const [lo, hi] = lobeOf(spec, index);
  let sum = 0;
  for (let k = lo; k <= hi; k++) sum += p(spec, k);
  return sum / spec.fft.enbw;
}

/** The tone's frequency: power-weighted centre of the main lobe (FFT), else the peak bin. */
export function toneCentre(spec: ToneSpectrum, index: number): number {
  if (!spec.fft) return spec.freqs[index] ?? NaN;
  const [lo, hi] = lobeOf(spec, index);
  let weighted = 0, total = 0;
  for (let k = lo; k <= hi; k++) { weighted += (spec.freqs[k] ?? 0) * p(spec, k); total += p(spec, k); }
  return total > 0 ? weighted / total : spec.freqs[index] ?? NaN;
}

/** DC and its lobe (FFT, or an analyzer trace that starts at 0 Hz) are never a tone. */
function dcBins(spec: ToneSpectrum): number {
  if (spec.fft) return spec.fft.lobe;
  return (spec.freqs[0] ?? 1) <= 0 ? lobeOf(spec, 0)[1] : -1;
}

/** Index of the fundamental: the largest bin outside DC, or the largest near `nearHz`. */
export function findFundamental(spec: ToneSpectrum, nearHz: number | null | undefined): number | null {
  const skip = dcBins(spec);
  const window = nearHz && nearHz > 0 ? Math.max(0.02 * nearHz, 5 * spacing(spec)) : Infinity;
  let best = -1;
  for (let k = skip + 1; k <= last(spec); k++) {
    if (Number.isFinite(window) && Math.abs((spec.freqs[k] ?? NaN) - (nearHz ?? 0)) > window) continue;
    if (best < 0 || p(spec, k) > p(spec, best)) best = k;
  }
  return best >= 0 && p(spec, best) > 0 ? best : null;
}

function nearestIndex(spec: ToneSpectrum, freq: number): number {
  if (spec.fft) return Math.max(0, Math.min(last(spec), Math.round((freq - (spec.freqs[0] ?? 0)) / spec.fft.binHz)));
  let lo = 0, hi = last(spec);
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if ((spec.freqs[mid] ?? 0) < freq) lo = mid; else hi = mid; }
  return Math.abs((spec.freqs[lo] ?? 0) - freq) <= Math.abs((spec.freqs[hi] ?? 0) - freq) ? lo : hi;
}

const median = (values: number[]): number => { values.sort((a, b) => a - b); return values[Math.floor(values.length / 2)] ?? NaN; };

export function measureTones(spec: ToneSpectrum, options: ToneOptions): ToneMetrics | null {
  if (spec.power.length < 3) return null;
  const index = findFundamental(spec, options.nearHz);
  if (index === null) return null;
  const p1 = tonePowerAt(spec, index);
  const f0 = toneCentre(spec, index);
  if (!(p1 > 0) || !(f0 > 0)) return null;

  const excluded = new Uint8Array(spec.power.length);
  const exclude = ([lo, hi]: [number, number]) => { for (let k = lo; k <= hi; k++) excluded[k] = 1; };
  const skip = dcBins(spec);
  for (let k = 0; k <= skip; k++) excluded[k] = 1;
  exclude(lobeOf(spec, index));

  // Harmonics: folded back below Nyquist for an FFT spectrum, otherwise only those inside the trace.
  const fs = spec.fft?.sampleRate ?? null;
  const top = fs ? fs / 2 : spec.freqs[last(spec)] ?? 0;
  const highest = options.harmonics === 'all' ? Math.floor(top / f0) : options.harmonics;
  const harmonics: ToneHarmonic[] = [];
  const reach = spec.fft ? 1 : 2;
  for (let order = 2; order <= highest; order++) {
    const target = order * f0;
    let freq = target;
    if (fs) { freq = target % fs; if (freq > fs / 2) freq = fs - freq; } else if (target > top) break;
    const centre = nearestIndex(spec, freq);
    let at = centre;
    for (let k = centre - reach; k <= centre + reach; k++) if (k >= 0 && k <= last(spec) && p(spec, k) > p(spec, at)) at = k;
    const power = tonePowerAt(spec, at);
    harmonics.push({ order, freq: spec.fft ? freq : spec.freqs[at] ?? freq, index: at, power, dBc: 10 * Math.log10(Math.max(power, 1e-300) / p1), aliased: target > top });
    exclude(lobeOf(spec, at));
  }
  const distortion = harmonics.reduce((sum, item) => sum + item.power, 0);

  // Largest component other than DC and the fundamental (harmonics count).
  let spurIndex = -1;
  for (let k = skip + 1; k <= last(spec); k++) {
    const [lo, hi] = lobeOf(spec, index);
    if (k >= lo && k <= hi) continue;
    if (spurIndex < 0 || p(spec, k) > p(spec, spurIndex)) spurIndex = k;
  }
  const spur = spurIndex >= 0 ? { index: spurIndex, freq: toneCentre(spec, spurIndex), power: tonePowerAt(spec, spurIndex) } : null;

  const noiseBins: number[] = [];
  for (let k = 0; k <= last(spec); k++) if (!excluded[k]) noiseBins.push(p(spec, k));
  // |X|² of FFT noise is exponentially distributed: mean = median / ln 2.
  const noiseFloor = noiseBins.length ? median([...noiseBins]) / (spec.fft ? Math.LN2 : 1) : NaN;

  let snr: number | null = null, sinad: number | null = null, enob: number | null = null, thdn: number | null = null;
  if (spec.fft && noiseBins.length) {
    // Total noise: the mean noise bin over the whole band (DC excluded), over ENBW (Parseval).
    const band = last(spec) - skip;
    const noise = ((noiseBins.reduce((sum, v) => sum + v, 0) / noiseBins.length) * band) / spec.fft.enbw;
    snr = 10 * Math.log10(p1 / noise);
    sinad = 10 * Math.log10(p1 / (noise + distortion));
    enob = (sinad - 1.76) / 6.02;
    thdn = 100 * Math.sqrt((noise + distortion) / p1);
  }

  return {
    fundamental: { index, freq: f0, power: p1 }, harmonics,
    thd: 100 * Math.sqrt(distortion / p1), thdDb: 10 * Math.log10(Math.max(distortion, 1e-300) / p1),
    spur, sfdr: spur ? 10 * Math.log10(p1 / Math.max(spur.power, 1e-300)) : NaN,
    noiseFloor, snr, sinad, enob, thdn,
  };
}
