import type { Complex } from '../../types/touchstone.ts';
import { gammaToAdmittance, gammaToImpedance, impedanceToGamma, passiveMetrics, seriesEquivalent } from './numerics.ts';
import type { SmithResult } from './numerics.ts';

/** Everything the readout strip and the hover card show for one point. */
export interface SmithReadout {
  readonly gamma: Complex;
  readonly z0: number;
  readonly frequencyHz: number;
  readonly magnitude: number;
  /** Degrees in (−180, 180]. */
  readonly angleDeg: number;
  /** Ohms. Negative R for an active port. */
  readonly impedance: SmithResult<Complex>;
  /** Siemens. */
  readonly admittance: SmithResult<Complex>;
  readonly vswr: SmithResult<number>;
  readonly returnLossDb: SmithResult<number>;
  readonly equivalent: SmithResult<{ kind: 'L' | 'C'; value: number }>;
}

/** |Γ| and ∠Γ in degrees. The angle of Γ = 0 is reported as 0. */
export function gammaPolar(g: Complex): { magnitude: number; angleDeg: number } | null {
  if (!Number.isFinite(g.re) || !Number.isFinite(g.im)) return null;
  const magnitude = Math.hypot(g.re, g.im);
  const angleDeg = magnitude === 0 ? 0 : (Math.atan2(g.im, g.re) * 180) / Math.PI;
  return { magnitude, angleDeg };
}

/** Γ referred to another real reference impedance: Γ′ = (Z − Z0′)/(Z + Z0′). An open stays an open. */
export function renormalizeGamma(g: Complex, fromZ0: number, toZ0: number): SmithResult<Complex> {
  if (fromZ0 === toZ0 && Number.isFinite(g.re) && Number.isFinite(g.im) && Number.isFinite(fromZ0) && fromZ0 > 0) return { kind: 'value', value: g };
  const z = gammaToImpedance(g, fromZ0);
  if (z.kind === 'undefined') {
    if (z.reason === 'singular' && Number.isFinite(toZ0) && toZ0 > 0) return { kind: 'value', value: { re: 1, im: 0 } };
    return z;
  }
  return impedanceToGamma(z.value, toZ0);
}

export function smithReadout(gamma: Complex, z0: number, frequencyHz: number): SmithReadout | null {
  const polar = gammaPolar(gamma);
  if (!polar) return null;
  const metrics = passiveMetrics(gamma);
  return {
    gamma, z0, frequencyHz, magnitude: polar.magnitude, angleDeg: polar.angleDeg,
    impedance: gammaToImpedance(gamma, z0), admittance: gammaToAdmittance(gamma, z0),
    vswr: metrics.vswr, returnLossDb: metrics.returnLossDb,
    equivalent: seriesEquivalent(gamma, z0, frequencyHz),
  };
}

// ---------------------------------------------------------------------------
// Text. A real minus sign (U+2212) is used so widths match the plus sign in the mono face.
// ---------------------------------------------------------------------------

const MINUS = '−';
export const SMITH_NO_VALUE = '—';

function fixed(value: number): string {
  const a = Math.abs(value);
  if (a >= 1e6) return a.toExponential(2);
  if (a >= 1000) return a.toFixed(0);
  if (a >= 100) return a.toFixed(1);
  return a.toFixed(2);
}
function signed(value: number): string {
  return `${value < 0 ? MINUS : ''}${fixed(value)}`;
}
function rectangular(z: Complex, unit: string): string {
  return `${signed(z.re)} ${z.im < 0 ? MINUS : '+'} j${fixed(z.im)} ${unit}`;
}

/** "R + jX Ω", for example "42.10 − j18.60 Ω". */
export function formatImpedance(z: SmithResult<Complex>): string {
  if (z.kind === 'undefined') return z.reason === 'singular' ? '∞ Ω' : SMITH_NO_VALUE;
  return rectangular(z.value, 'Ω');
}
/** "G + jB mS". */
export function formatAdmittance(y: SmithResult<Complex>): string {
  if (y.kind === 'undefined') return y.reason === 'singular' ? '∞ mS' : SMITH_NO_VALUE;
  return rectangular({ re: y.value.re * 1000, im: y.value.im * 1000 }, 'mS');
}
/** "0.333 ∠ −180.0°". */
export function formatGammaPolar(magnitude: number, angleDeg: number): string {
  if (!Number.isFinite(magnitude) || !Number.isFinite(angleDeg)) return SMITH_NO_VALUE;
  return `${magnitude.toFixed(3)} ∠ ${angleDeg < 0 ? MINUS : ''}${Math.abs(angleDeg).toFixed(1)}°`;
}
export function formatVswr(vswr: SmithResult<number>): string {
  if (vswr.kind === 'undefined') return vswr.reason === 'singular' ? '∞' : SMITH_NO_VALUE;
  return vswr.value >= 1000 ? vswr.value.toExponential(1) : vswr.value >= 100 ? vswr.value.toFixed(0) : vswr.value.toFixed(2);
}
export function formatReturnLoss(rl: SmithResult<number>): string {
  if (rl.kind === 'undefined') return rl.reason === 'singular' ? '∞ dB' : SMITH_NO_VALUE;
  return `${rl.value.toFixed(2)} dB`;
}

const SI_PREFIXES: readonly (readonly [number, string])[] = [[1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']];
/** "3.25 nH" or "1.30 pF". */
export function formatEquivalent(eq: SmithResult<{ kind: 'L' | 'C'; value: number }>): string {
  if (eq.kind === 'undefined') return SMITH_NO_VALUE;
  const unit = eq.value.kind === 'L' ? 'H' : 'F';
  const v = eq.value.value;
  const entry = SI_PREFIXES.find(([factor]) => v >= factor) ?? SI_PREFIXES[SI_PREFIXES.length - 1];
  if (!entry) return SMITH_NO_VALUE;
  const scaled = v / entry[0];
  const text = scaled >= 100 ? scaled.toFixed(1) : scaled >= 10 ? scaled.toFixed(2) : scaled.toFixed(3);
  return `${text} ${entry[1]}${unit}`;
}

/** Short frequency for the start and end dots, trailing zeros removed: "500 MHz", "6 GHz". */
export function formatSmithFrequencyShort(hz: number): string {
  if (!Number.isFinite(hz)) return SMITH_NO_VALUE;
  const a = Math.abs(hz);
  const [factor, unit] = a >= 1e9 ? [1e9, 'GHz'] : a >= 1e6 ? [1e6, 'MHz'] : a >= 1e3 ? [1e3, 'kHz'] : [1, 'Hz'];
  return `${hz < 0 ? MINUS : ''}${String(Number((a / factor).toPrecision(4)))} ${unit}`;
}

/** Frequency with an SI prefix and four decimals at most: "2.4500 GHz". */
export function formatSmithFrequency(hz: number): string {
  if (!Number.isFinite(hz)) return SMITH_NO_VALUE;
  const a = Math.abs(hz);
  const sign = hz < 0 ? MINUS : '';
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(4)} GHz`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(3)} MHz`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(3)} kHz`;
  return `${sign}${a.toFixed(1)} Hz`;
}

/** Three significant digits, no trailing zeros, no sign: 42.1, 8.3, 1230. */
function sig3(value: number): string {
  return String(Number(Math.abs(value).toPrecision(3)));
}

/**
 * The footer's mouse position over a Smith pane: "Z 42.1 + j8.3 Ω  Γ 0.12 ∠ 61°" (a free point, referred to `z0`).
 * Shorter than the readout strip: a moving pointer needs no more precision than this.
 */
export function smithPointerText(gamma: Complex, z0: number): string {
  const polar = gammaPolar(gamma);
  const z = gammaToImpedance(gamma, z0);
  const zText = z.kind === 'undefined'
    ? (z.reason === 'singular' ? '∞ Ω' : SMITH_NO_VALUE)
    : `${z.value.re < 0 ? MINUS : ''}${sig3(z.value.re)} ${z.value.im < 0 ? MINUS : '+'} j${sig3(z.value.im)} Ω`;
  const angle = polar ? Math.round(polar.angleDeg) : 0;
  const gText = polar ? `${polar.magnitude.toFixed(2)} ∠ ${angle < 0 ? MINUS : ''}${Math.abs(angle)}°` : SMITH_NO_VALUE;
  return `Z ${zText}  Γ ${gText}`;
}
