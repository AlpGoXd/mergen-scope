// Number formatting for the Table pane. Pure, no React.
// One SI prefix per column (the unit goes in the column heading), a real minus, tabular-friendly fixed decimals.
import { engineeringUnitLabel, isLogUnit } from './units';

export interface TableNumberFormat {
  /** Unit for the heading, with the column's prefix (e.g. "GHz", "mV", "dB"); empty when there is none. */
  readonly unit: string;
  readonly format: (value: number) => string;
}

const MINUS = '−';

function fixed(value: number, decimals: number): string {
  const text = value.toFixed(decimals);
  if (/^-0(?:\.0*)?$/.test(text)) return text.slice(1);
  return text.startsWith('-') ? `${MINUS}${text.slice(1)}` : text;
}

/**
 * Decimals that keep neighbouring rows apart: exact when the smallest row step is a short decimal
 * in the chosen prefix (2.5 MHz in GHz gives 4), otherwise two significant digits of that step. 0 to 9.
 */
export function decimalsForRows(xs: readonly number[], factor: number): number {
  let step = Infinity;
  for (let i = 1; i < xs.length; i++) {
    const a = xs[i - 1], b = xs[i];
    if (a === undefined || b === undefined) continue;
    const d = b - a;
    if (d > 0 && d < step) step = d;
  }
  const scaled = step / factor;
  if (!Number.isFinite(scaled) || scaled <= 0) return 3;
  for (let d = 0; d <= 9; d++) {
    const v = scaled * 10 ** d;
    if (v > 1000) break; // a short decimal has at most three significant digits
    if (v >= 0.5 && Math.abs(v - Math.round(v)) <= 1e-6) return d;
  }
  return Math.max(0, Math.min(9, Math.ceil(-Math.log10(scaled)) + 1));
}

/** X column: the prefix from the largest |x|, decimals from the row spacing. */
export function tableXFormat(xs: readonly number[], baseUnit: string | null | undefined): TableNumberFormat {
  const first = xs[0], last = xs[xs.length - 1];
  const reference = Math.max(Math.abs(first ?? 0), Math.abs(last ?? 0));
  const { factor, unit } = engineeringUnitLabel(reference, baseUnit);
  const decimals = decimalsForRows(xs, factor);
  return { unit, format: value => fixed(value / factor, decimals) };
}

/**
 * Value column: dB-family units use two decimals; other units take one prefix from the column's largest |y|
 * and show four significant digits of it.
 */
export function tableYFormat(ys: ArrayLike<number>, unit: string | null | undefined): TableNumberFormat {
  const text = String(unit ?? '').trim();
  if (isLogUnit(text) || text.toLowerCase().startsWith('db')) return { unit: text, format: value => fixed(value, 2) };
  let reference = 0;
  for (let i = 0; i < ys.length; i++) {
    const y = ys[i];
    if (y !== undefined && Number.isFinite(y)) reference = Math.max(reference, Math.abs(y));
  }
  const label = engineeringUnitLabel(reference, text);
  const scaled = reference / label.factor;
  const decimals = scaled > 0 ? Math.max(0, Math.min(6, 3 - Math.floor(Math.log10(scaled)))) : 3;
  return { unit: label.unit, format: value => fixed(value / label.factor, decimals) };
}
