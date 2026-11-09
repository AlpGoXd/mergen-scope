import type { Complex } from '../../types/touchstone.ts';

/** Invalid/singular values are explicit; no clamping or fabricated finite values. */
export type SmithResult<T> =
  | { readonly kind: 'value'; readonly value: T }
  | { readonly kind: 'undefined'; readonly reason: 'nonfinite' | 'invalid-z0' | 'singular' | 'active' | 'dc' | 'zero-reactance' | 'underflow' | 'ambiguous-boundary' };
const value = <T>(v: T): SmithResult<T> => ({ kind: 'value', value: v });
const undefinedResult = <T>(reason: Extract<SmithResult<T>, {kind: 'undefined'}>['reason']): SmithResult<T> => ({ kind: 'undefined', reason });
const finite = (z: Complex) => Number.isFinite(z.re) && Number.isFinite(z.im);
const validZ0 = (z0: number) => Number.isFinite(z0) && z0 > 0;

/** Real positive reference impedance in ohms for a zero-based port. */
export function portZ0(z0: readonly number[], port: number): SmithResult<number> {
  const selected = z0[port];
  if (!Number.isInteger(port) || port < 0 || selected === undefined || !validZ0(selected)) return undefinedResult('invalid-z0');
  return value(selected);
}

// Division is scaled to avoid squaring huge denominators. Nonrepresentable output remains undefined.
function divide(a: Complex, b: Complex): SmithResult<Complex> {
  if (!finite(a) || !finite(b)) return undefinedResult('nonfinite');
  const scale = Math.max(Math.abs(b.re), Math.abs(b.im));
  if (scale === 0) return undefinedResult('singular');
  const br = b.re / scale, bi = b.im / scale;
  const ar = a.re / scale, ai = a.im / scale, den = br * br + bi * bi;
  const result = { re: (ar * br + ai * bi) / den, im: (ai * br - ar * bi) / den };
  return finite(result) ? value(result) : undefinedResult('nonfinite');
}

/** Z in ohms to G; short is Z=0. An open is represented directly by G=1. */
export function impedanceToGamma(z: Complex, z0: number): SmithResult<Complex> {
  if (!validZ0(z0)) return undefinedResult('invalid-z0');
  if (!finite(z)) return undefinedResult('nonfinite');
  return divide({ re: z.re / z0 - 1, im: z.im / z0 }, { re: z.re / z0 + 1, im: z.im / z0 });
}
/** Y in siemens to G; open is Y=0. A short is represented directly by G=-1. */
export function admittanceToGamma(y: Complex, z0: number): SmithResult<Complex> {
  if (!validZ0(z0)) return undefinedResult('invalid-z0');
  if (!finite(y)) return undefinedResult('nonfinite');
  return divide({ re: 1 - y.re * z0, im: -y.im * z0 }, { re: 1 + y.re * z0, im: y.im * z0 });
}
export function gammaToImpedance(g: Complex, z0: number): SmithResult<Complex> {
  if (!validZ0(z0)) return undefinedResult('invalid-z0');
  if (!finite(g)) return undefinedResult('nonfinite');
  const q = divide({ re: 1 + g.re, im: g.im }, { re: 1 - g.re, im: -g.im });
  if (q.kind === 'undefined') return q;
  const z = { re: q.value.re * z0, im: q.value.im * z0 };
  return finite(z) ? value(z) : undefinedResult('nonfinite');
}
export function gammaToAdmittance(g: Complex, z0: number): SmithResult<Complex> {
  if (!validZ0(z0)) return undefinedResult('invalid-z0');
  if (!finite(g)) return undefinedResult('nonfinite');
  const q = divide({ re: 1 - g.re, im: -g.im }, { re: 1 + g.re, im: g.im });
  if (q.kind === 'undefined') return q;
  const y = { re: q.value.re / z0, im: q.value.im / z0 };
  return finite(y) ? value(y) : undefinedResult('nonfinite');
}
/** At |G|=1 VSWR is singular; at match RL is singular (+8). Active loads have neither passive readout. */
export function passiveMetrics(g: Complex): { vswr: SmithResult<number>; returnLossDb: SmithResult<number> } {
  if (!finite(g)) return { vswr: undefinedResult('nonfinite'), returnLossDb: undefinedResult('nonfinite') };
  const mag = Math.hypot(g.re, g.im);
  if (!Number.isFinite(mag)) return { vswr: undefinedResult('nonfinite'), returnLossDb: undefinedResult('nonfinite') };
  // A few ulps around the unit circle are numerically indistinguishable from a lossless load.
  if (mag > 1 + 4 * Number.EPSILON) return { vswr: undefinedResult('active'), returnLossDb: undefinedResult('active') };
  if (mag > 1) return { vswr: undefinedResult('ambiguous-boundary'), returnLossDb: undefinedResult('ambiguous-boundary') };
  return {
    vswr: mag === 1 ? undefinedResult('singular') : value((1 + mag) / (1 - mag)),
    returnLossDb: mag === 0 ? undefinedResult('singular') : value(-20 * Math.log10(mag)),
  };
}
/** Series equivalent from impedance: positive X is L, negative X is C. */
export function seriesEquivalent(g: Complex, z0: number, frequencyHz: number): SmithResult<{ kind: 'L' | 'C'; value: number }> {
  if (!Number.isFinite(frequencyHz)) return undefinedResult('nonfinite');
  if (frequencyHz <= 0) return undefinedResult('dc');
  if (!finite(g)) return undefinedResult('nonfinite');
  const magnitude = Math.hypot(g.re, g.im);
  if (magnitude > 1 + 4 * Number.EPSILON) return undefinedResult('active');
  if (magnitude > 1) return undefinedResult('ambiguous-boundary');
  const z = gammaToImpedance(g, z0);
  if (z.kind === 'undefined') return z;
  const x = z.value.im;
  if (x === 0) return undefinedResult('zero-reactance');
  // Try complementary evaluation orders to avoid intermediate overflow or underflow.
  const candidates = x > 0
    ? [(x / frequencyHz) / (2 * Math.PI), (x / (2 * Math.PI)) / frequencyHz]
    : [((1 / -x) / frequencyHz) / (2 * Math.PI), ((1 / frequencyHz) / -x) / (2 * Math.PI)];
  const n = candidates.find(candidate => Number.isFinite(candidate) && candidate > 0)
    ?? Math.exp((x > 0 ? Math.log(x) - Math.log(frequencyHz) : -Math.log(-x) - Math.log(frequencyHz)) - Math.log(2 * Math.PI));
  if (!Number.isFinite(n)) return undefinedResult('nonfinite');
  if (n === 0) return undefinedResult('underflow');
  return value({ kind: x > 0 ? 'L' : 'C', value: n });
}
