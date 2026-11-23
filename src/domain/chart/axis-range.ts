import { formatEngineeringValue, parseEngInput } from '../format';
import { NICE_TICK_COUNT } from '../trace-math';
import type { AxisScale } from '../../types/pane';

/** Number of grid divisions matching NICE_TICK_COUNT (7 ticks = 6 divisions). */
export const AXIS_DIVISIONS = NICE_TICK_COUNT - 1;

export interface AxisRange {
  readonly min: number;
  readonly max: number;
}

export type AxisValueParseResult =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly reason: string };

export type AxisRangeUpdateResult =
  | { readonly ok: true; readonly range: AxisRange }
  | { readonly ok: false; readonly reason: string };

const PREFIXABLE_UNITS = new Set(['hz', 's', 'v', 'a', 'w', 'ohm', 'ohms', 'f', 'h']);

function isPrefixableUnit(unit: string | null | undefined): boolean {
  const raw = String(unit ?? '').trim();
  if (!raw) return false;
  if (raw === 'S') return true;
  return PREFIXABLE_UNITS.has(raw.toLowerCase());
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseFailureMessage(reason: string, unit?: string | null): string {
  if (reason === 'empty') return 'Enter a number';
  if (reason === 'unit-mismatch') return unit ? `Expected ${unit}` : 'Unit does not match axis';
  if (reason === 'overflow' || reason === 'non-finite') return 'Number is out of range';
  if (reason === 'unknown-unit') return unit ? `Use a number or ${unit}` : 'Unrecognised unit';
  return 'Enter a valid number';
}

/**
 * Parse a user-entered axis value (min, max, or per-division step).
 * Accepts engineering prefixes (e.g. "2.4 GHz", "500 k", "20 ms"), plain numbers,
 * and optional matching unit labels (e.g. "-40 dBm", "90 deg", or "200 k/div").
 */
export function parseAxisValue(
  raw: string,
  unit?: string | null,
  stripPerDiv = false,
): AxisValueParseResult {
  let text = String(raw ?? '').trim().replace(/\u2212/g, '-');
  if (stripPerDiv) {
    text = text.replace(/\s*\/\s*div$/i, '').trim();
  }
  if (!text) return { ok: false, reason: 'Enter a number' };

  const trimmedUnit = String(unit ?? '').trim();
  const baseUnit = trimmedUnit && (isPrefixableUnit(trimmedUnit) || /^db/i.test(trimmedUnit))
    ? trimmedUnit
    : undefined;

  const parsed = parseEngInput(text, baseUnit ? { baseUnit } : {});
  if (parsed.ok) return { ok: true, value: parsed.value };

  // Handle non-SI units like "deg", "°", "dBm/Hz", or "ratio" appended to a plain number.
  if (trimmedUnit && (parsed.reason === 'unknown-unit' || parsed.reason === 'invalid-number')) {
    const unitPattern = new RegExp(`\\s*${escapeRegExp(trimmedUnit)}$`, 'i');
    if (unitPattern.test(text)) {
      const stripped = text.replace(unitPattern, '').trim();
      const retry = parseEngInput(stripped);
      if (retry.ok) return { ok: true, value: retry.value };
    }
  }

  return { ok: false, reason: parseFailureMessage(parsed.reason, trimmedUnit || undefined) };
}

/** Format an axis bound for display and editing, preserving SI prefixes for prefixable units. */
export function formatAxisBound(value: number, unit?: string | null, digits = 4): string {
  if (!Number.isFinite(value)) return '—';
  const trimmedUnit = String(unit ?? '').trim();
  if (isPrefixableUnit(trimmedUnit)) {
    return formatEngineeringValue(value, trimmedUnit, digits).trim();
  }
  const abs = Math.abs(value);
  const formatted = abs === 0
    ? '0'
    : abs >= 1e6 || abs < 1e-4
      ? value.toExponential(Math.min(digits, 4))
      : value.toFixed(digits).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  const clean = formatted === '-0' ? '0' : formatted;
  return trimmedUnit ? `${clean} ${trimmedUnit}` : clean;
}

/** Validate and apply a new minimum bound to an axis range. */
export function applyAxisMin(
  current: AxisRange,
  raw: string,
  scale: AxisScale,
  unit?: string | null,
): AxisRangeUpdateResult {
  const parsed = parseAxisValue(raw, unit, false);
  if (!parsed.ok) return parsed;
  if (scale === 'log' && !(parsed.value > 0)) {
    return { ok: false, reason: 'Log axis values must be > 0' };
  }
  if (!(parsed.value < current.max)) {
    return { ok: false, reason: 'Min must be less than max' };
  }
  return { ok: true, range: { min: parsed.value, max: current.max } };
}

/** Validate and apply a new maximum bound to an axis range. */
export function applyAxisMax(
  current: AxisRange,
  raw: string,
  scale: AxisScale,
  unit?: string | null,
): AxisRangeUpdateResult {
  const parsed = parseAxisValue(raw, unit, false);
  if (!parsed.ok) return parsed;
  if (scale === 'log' && !(parsed.value > 0)) {
    return { ok: false, reason: 'Log axis values must be > 0' };
  }
  if (!(parsed.value > current.min)) {
    return { ok: false, reason: 'Max must be greater than min' };
  }
  return { ok: true, range: { min: current.min, max: parsed.value } };
}

/**
 * Validate and apply a new per-division step on a linear axis.
 * Keeps the current view center fixed and sets total span = divisions * perDiv.
 */
export function applyAxisPerDiv(
  current: AxisRange,
  raw: string,
  scale: AxisScale,
  unit?: string | null,
  divisions = AXIS_DIVISIONS,
): AxisRangeUpdateResult {
  if (scale === 'log') {
    return { ok: false, reason: 'Division step is only available on linear axes' };
  }
  const parsed = parseAxisValue(raw, unit, true);
  if (!parsed.ok) return parsed;
  if (!(parsed.value > 0)) {
    return { ok: false, reason: 'Step must be greater than 0' };
  }
  const center = (current.min + current.max) / 2;
  const halfSpan = (parsed.value * divisions) / 2;
  const min = center - halfSpan;
  const max = center + halfSpan;
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) {
    return { ok: false, reason: 'Range is out of bounds' };
  }
  return { ok: true, range: { min, max } };
}
