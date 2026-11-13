import { useState, useEffect } from 'react';
import type { Marker } from '../../types/marker';
import type { Trace } from '../../types/trace';
import { formatAdaptiveXAxisValue, formatScalarWithUnit } from '../../domain/format';

export interface MarkerItemProps {
  marker: Marker;
  index: number;
  trace: Trace | null;
  traceColor: string;
  xSpan: number;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  compact: boolean;
  onUpdateFreq: (freq: number) => void;
  paneNumber?: number;
  refMarker?: Marker | null;
  allMarkers?: readonly Marker[];
  onUpdateRefIdx?: (refIdx: number | null) => void;
}

const SI: Record<string, number> = {
  T: 1e12, G: 1e9, M: 1e6, k: 1e3, K: 1e3,
  m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12,
};

function parseFreq(text: string, domain?: string): number | null {
  const s = text.trim().replace(/\s+/g, '').replace(/µ/g, 'u');
  if (!s) return null;
  const m = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)([A-Za-z]*)$/);
  if (!m) return null;
  const num = Number(m[1]);
  if (!Number.isFinite(num)) return null;
  const suf = (m[2] ?? '').trim();
  if (!suf) return num;
  const lower = suf.toLowerCase();
  if (lower === 'hz') return num;
  if (lower === 'khz') return num * 1e3;
  if (lower === 'mhz') return num * 1e6;
  if (lower === 'ghz') return num * 1e9;
  if (lower === 'thz') return num * 1e12;
  if (domain === 'time') {
    if (lower === 's' || lower === 'sec') return num;
    if (lower === 'ms') return num * 1e-3;
    if (lower === 'us') return num * 1e-6;
    if (lower === 'ns') return num * 1e-9;
    if (lower === 'ps') return num * 1e-12;
  }
  const scale = SI[suf[0] ?? ''];
  if (scale != null) return num * scale;
  return num;
}

function fmtFreq(freq: number, xSpan: number, trace: Trace | null): string {
  return formatAdaptiveXAxisValue(freq, xSpan || Math.abs(freq) || 1, {
    domain: trace?.domain ?? 'frequency',
    unit: trace?.units.x ?? (trace?.domain === 'time' ? 's' : 'Hz'),
  });
}

export function MarkerItem({
  marker,
  index,
  trace,
  traceColor,
  xSpan,
  isSelected,
  onSelect,
  onRemove,
  compact,
  onUpdateFreq,
}: MarkerItemProps) {
  const labelPrefix = marker.type === 'delta' ? `DM${index + 1}` : `M${index + 1}`;

  const [focused, setFocused] = useState(false);
  const [editText, setEditText] = useState('');

  const displayFreq = fmtFreq(marker.freq, xSpan, trace);

  useEffect(() => {
    if (!focused) setEditText(displayFreq);
  }, [marker.freq, focused, displayFreq]);

  const commitFreq = () => {
    setFocused(false);
    const parsed = parseFreq(editText, trace?.domain);
    if (parsed != null && Number.isFinite(parsed)) {
      onUpdateFreq(parsed);
    } else {
      setEditText(displayFreq);
    }
  };

  const ampStr = formatScalarWithUnit(marker.amp, trace?.units.y ?? null, { digits: 3 });

  return (
    <div
      onClick={onSelect}
      style={{
        border: isSelected ? `1px solid ${traceColor}` : '1px solid var(--border)',
        borderLeft: `4px solid ${traceColor}`,
        borderRadius: '6px',
        padding: compact ? '4px 6px' : '6px 8px',
        fontSize: 'var(--font-caption)',
        cursor: 'pointer',
        background: isSelected ? 'var(--bg)' : 'transparent',
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
      }}
    >
      {/* Header row: label + amp + remove */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <strong style={{ color: traceColor, flexShrink: 0 }}>
          {labelPrefix}{marker.interpolated ? ' ~' : ''}
        </strong>
        <span style={{ flex: 1, color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-caption)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ampStr}
        </span>
        <span
          title="Remove Marker"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{ cursor: 'pointer', color: 'var(--dim)', padding: '0 4px', fontSize: 'var(--font-label)', flexShrink: 0 }}
        >
          ×
        </span>
      </div>

      {/* Freq input row */}
      <input
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        onFocus={(e) => {
          setFocused(true);
          setEditText(String(marker.freq));
          e.currentTarget.select();
        }}
        onBlur={commitFreq}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { setFocused(false); setEditText(displayFreq); e.currentTarget.blur(); }
        }}
        onClick={(e) => e.stopPropagation()}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-caption)',
          background: focused ? 'var(--bg)' : 'transparent',
          border: focused
            ? `1px solid ${traceColor}`
            : `1px solid color-mix(in srgb, ${traceColor} 30%, var(--border))`,
          borderRadius: '4px',
          padding: '2px 6px',
          color: 'var(--text)',
          width: '100%',
          cursor: 'text',
          outline: 'none',
        }}
      />
    </div>
  );
}
