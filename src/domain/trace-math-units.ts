// Result unit of A ± B, A × B, A ÷ B (design decisions 2026-11-10, "Trace math units").
// Nothing is blocked: combinations without a meaningful unit still compute, with a warning and
// no unit on the output.
import { normalizeUnitName, isDbRatioUnit, isLogLevelUnit } from './units';

export type TraceMathOp = 'add' | 'subtract' | 'multiply' | 'divide';

export interface TraceMathUnitResult {
  /** The output unit, or null when there is none ("–" on its axis). '' means a plain number (unitless). */
  readonly unit: string | null;
  /** A short sentence for the card, shown as a warning message. */
  readonly warning?: string;
}

const SYMBOL: Record<TraceMathOp, string> = { add: '+', subtract: '−', multiply: '×', divide: '÷' };

/** The unit as the user wrote it, trimmed (keeps "dBm", "GHz", "V" casing for display). */
const display = (u: string | null | undefined): string => (u ?? '').trim();

export function traceMathUnit(aUnit: string | null | undefined, bUnit: string | null | undefined, op: TraceMathOp): TraceMathUnitResult {
  const a = display(aUnit), b = display(bUnit);
  const an = normalizeUnitName(a), bn = normalizeUnitName(b);
  const noMeaning = (why?: string): TraceMathUnitResult => ({
    unit: null,
    warning: `${a || 'no unit'} ${SYMBOL[op]} ${b || 'no unit'} has no meaningful unit${why ? `: ${why}` : '.'}`,
  });

  // Plain numbers on both sides.
  if (!an && !bn) return { unit: '' };
  if (!an || !bn) return noMeaning('one trace has no unit.');

  const aRatio = isDbRatioUnit(a), bRatio = isDbRatioUnit(b);
  const aLevel = isLogLevelUnit(a), bLevel = isLogLevelUnit(b);
  const aLog = aRatio || aLevel, bLog = bRatio || bLevel;

  if (aLog || bLog) {
    if (op === 'multiply' || op === 'divide') return noMeaning('values in dB are added and subtracted, not multiplied or divided.');
    if (op === 'add') {
      if (aRatio && bRatio) return { unit: 'dB' };            // gain + gain
      if (aLevel && bRatio) return { unit: a };               // power + gain
      if (aRatio && bLevel) return { unit: b };               // gain + power
      if (aLevel && bLevel) return noMeaning('convert to linear (W) first to add powers.');
      return noMeaning();
    }
    // subtract
    if (aRatio && bRatio) return { unit: 'dB' };              // gain − gain
    if (aLevel && bRatio) return { unit: a };                 // power − gain
    if (aLevel && bLevel) return an === bn ? { unit: 'dB' } : noMeaning(`${a} and ${b} have different references.`);
    return noMeaning();                                       // dB − dBm, dB − linear …
  }

  // Linear units.
  if (an !== bn) return noMeaning();
  if (op === 'add' || op === 'subtract') return { unit: a };
  if (op === 'multiply') return { unit: `${a}²` };
  return { unit: '' };
}
