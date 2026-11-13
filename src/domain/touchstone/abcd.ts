import type { ComplexMatrix } from '../../types/touchstone';
import { add, sub, mul, div } from '../complex';

/** Power-wave S parameters to a two-port chain matrix, for real positive port impedances. */
export function sToAbcd(s: ComplexMatrix, references: readonly number[]): ComplexMatrix | null {
  const s11 = s[0]?.[0], s12 = s[0]?.[1], s21 = s[1]?.[0], s22 = s[1]?.[1];
  const z1 = references[0], z2 = references[1];
  if (!s11 || !s12 || !s21 || !s22 || !z1 || !z2 || z1 <= 0 || z2 <= 0 || !Number.isFinite(z1) || !Number.isFinite(z2)) return null;
  const one = { re: 1, im: 0 }, product = mul(s12, s21), denominator = mul({ re: 2, im: 0 }, s21);
  const scale = (numerator: {re: number; im: number}, factor: number) => { const value = div(numerator, denominator); return value && mul(value, { re: factor, im: 0 }); };
  const a = scale(add(mul(add(one, s11), sub(one, s22)), product), Math.sqrt(z1 / z2));
  const b = scale(sub(mul(add(one, s11), add(one, s22)), product), Math.sqrt(z1 * z2));
  const c = scale(sub(mul(sub(one, s11), sub(one, s22)), product), 1 / Math.sqrt(z1 * z2));
  const d = scale(add(mul(sub(one, s11), add(one, s22)), product), Math.sqrt(z2 / z1));
  return a && b && c && d ? [[a,b],[c,d]] : null;
}
