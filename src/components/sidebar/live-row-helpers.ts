import type { CSSProperties } from 'react';
import { formatAdaptiveXAxisValue, formatEngineeringValue, formatScalarWithUnit } from '../../domain/format';
import { parseEngInput } from '../../domain/units';
import type { RefLine } from '../../types/ref-line';
import type { Trace } from '../../types/trace';

const FREQUENCY_UNIT_SCALE: Record<string, number> = {
  hz: 1,
  khz: 1e3,
  mhz: 1e6,
  ghz: 1e9,
  thz: 1e12,
};

const TIME_UNIT_SCALE: Record<string, number> = {
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1,
  ms: 1e-3,
  us: 1e-6,
  ns: 1e-9,
  ps: 1e-12,
};

export const badgeStyle: CSSProperties = {
  fontSize: 'var(--font-caption)',
  color: 'var(--dim)',
  border: '1px solid color-mix(in srgb, var(--accent) 8%, var(--border))',
  borderRadius: '999px',
  padding: '0.08rem 0.42rem',
  lineHeight: 'var(--lh-caption)',
  background: 'var(--panel)',
};

const smallButtonBaseStyle: CSSProperties = {
  background: 'var(--raised)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  padding: '0.22rem 0.58rem',
  fontSize: 'var(--font-label)',
  cursor: 'pointer',
  color: 'var(--text)',
  fontWeight: 400,
  lineHeight: 'var(--lh-label)',
  transition: 'all 0.15s ease-in-out',
};

export function sidebarButtonStyle(color: string, active = false, compact = false): CSSProperties {
  return {
    ...smallButtonBaseStyle,
    border: `1px solid ${active ? color : 'var(--border)'}`,
    background: active ? `color-mix(in srgb, ${color} 12%, var(--raised))` : 'var(--raised)',
    color: active ? color : 'var(--text-muted)',
    padding: compact ? '0.18rem 0.5rem' : '0.24rem 0.58rem',
    fontSize: 'var(--font-label)',
  };
}

function normalizeUnit(unit: string | null | undefined): string {
  return String(unit ?? '').trim().toLowerCase();
}

export function formatWithUnit(value: number, unit: string | null | undefined): string {
  if (!Number.isFinite(value)) {
    return '--';
  }

  const normalized = normalizeUnit(unit);
  if (normalized in FREQUENCY_UNIT_SCALE) {
    const hz = value * FREQUENCY_UNIT_SCALE[normalized as keyof typeof FREQUENCY_UNIT_SCALE]!;
    return formatEngineeringValue(hz, 'Hz', 3);
  }

  if (normalized in TIME_UNIT_SCALE) {
    const seconds = value * TIME_UNIT_SCALE[normalized as keyof typeof TIME_UNIT_SCALE]!;
    return formatScalarWithUnit(seconds, 's', { digits: 3 });
  }

  return formatScalarWithUnit(value, unit, { digits: 3 });
}

export function formatTraceXValue(value: number, trace: Trace | null, visibleSpan?: number): string {
  const hasVisibleSpan = Number.isFinite(visibleSpan) && (visibleSpan ?? 0) > 0;
  if (!trace) {
    return hasVisibleSpan
      ? formatAdaptiveXAxisValue(value, visibleSpan!, { domain: 'frequency', unit: 'Hz' })
      : formatEngineeringValue(value, 'Hz', 3);
  }
  if (!hasVisibleSpan) {
    if (trace.domain === 'frequency') {
      return formatEngineeringValue(value, 'Hz', 3);
    }
    return formatWithUnit(value, trace.units.x ?? 's');
  }
  return formatAdaptiveXAxisValue(value, visibleSpan!, {
    domain: trace.domain,
    unit: trace.units.x ?? (trace.domain === 'time' ? 's' : 'Hz'),
  });
}

export function formatTraceYValue(value: number, trace: Trace | null): string {
  return formatWithUnit(value, trace?.units.y ?? null);
}

export function formatRefLineValue(refLine: RefLine, selectedTrace: Trace | null, visibleSpan?: number): string {
  if (refLine.type === 'v') {
    return formatTraceXValue(refLine.value, selectedTrace, visibleSpan);
  }
  return formatWithUnit(refLine.value, selectedTrace?.units.y ?? null);
}

export function parseEngineeringInput(text: string, trace: Trace | null): number | null {
  const baseUnit = trace?.domain === 'time'
    ? 's'
    : trace?.domain === 'frequency'
      ? 'Hz'
      : undefined;
  const result = parseEngInput(text, { baseUnit });
  return result.ok ? result.value : null;
}
