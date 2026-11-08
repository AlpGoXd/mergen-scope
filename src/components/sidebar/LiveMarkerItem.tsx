import { useEffect, useState } from 'react';
import type { Marker } from '../../types/marker';
import type { Trace } from '../../types/trace';
import { MR } from '../shared/MR';
import { PretextLabel } from '../shared/PretextLabel';
import { badgeStyle, formatTraceXValue, formatTraceYValue, parseEngineeringInput, sidebarButtonStyle } from './live-row-helpers';

export function MarkerItem(props: {
  marker: Marker;
  index: number;
  trace: Trace | null;
  traceColor: string;
  xSpan: number;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  compact?: boolean;
  onUpdateFreq: (freq: number) => void;
  paneNumber: number;
  refMarker?: Marker | null;
  allMarkers?: Marker[];
  onUpdateRefIdx?: (refIdx: number | null) => void;
}) {
  const { marker, index, trace, traceColor, xSpan, isSelected, onSelect, onRemove, compact = false, onUpdateFreq, paneNumber, refMarker = null, allMarkers = [], onUpdateRefIdx } = props;
  const roleLabel = marker.label ? ` - ${marker.label}` : '';
  const [freqFocused, setFreqFocused] = useState(false);
  const [freqText, setFreqText] = useState(() => formatTraceXValue(marker.freq, trace, xSpan));

  useEffect(() => {
    if (!freqFocused) setFreqText(formatTraceXValue(marker.freq, trace, xSpan));
  }, [marker.freq, trace, xSpan, freqFocused]);

  const commitFreq = () => {
    setFreqFocused(false);
    const parsed = parseEngineeringInput(freqText, trace);
    if (parsed == null) {
      setFreqText(formatTraceXValue(marker.freq, trace, xSpan));
      return;
    }
    onUpdateFreq(parsed);
  };

  return (
    <div
      data-testid={`marker-row-${index + 1}`}
      onClick={onSelect}
      style={{
        border: `1px solid ${isSelected ? traceColor : `color-mix(in srgb, ${traceColor} 20%, var(--border))`}`,
        borderRadius: compact ? '7px' : '8px',
        padding: compact ? '4px 5px' : '5px 6px',
        background: isSelected
          ? `color-mix(in srgb, ${traceColor} 14%, white)`
          : `color-mix(in srgb, ${traceColor} 6%, white)`,
        boxShadow: `inset 3px 0 0 ${traceColor}`,
        display: 'grid',
        gap: compact ? '3px' : '4px',
        cursor: 'pointer',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: compact ? '4px' : '6px', alignItems: 'start', minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
          <span
            title={`Marker ${index + 1}`}
            style={{
              ...badgeStyle,
              padding: '1px 6px',
              background: isSelected ? traceColor : 'rgba(255,255,255,0.94)',
              borderColor: traceColor,
              color: isSelected ? '#ffffff' : traceColor,
            }}
          >
            {marker.type === 'delta' ? `DM${index + 1}` : `M${index + 1}`}
          </span>
          <span
            title={`Pane ${paneNumber}`}
            style={{
              ...badgeStyle,
              padding: '1px 5px',
              background: 'transparent',
              borderColor: 'var(--border)',
              color: 'var(--muted)',
            }}
          >
            P{paneNumber}
          </span>
        </div>
        <div style={{ minWidth: 0, display: 'grid', gap: '1px' }}>
          <PretextLabel
            text={`${trace?.dn ?? marker.trace}${roleLabel}`}
            font="400 var(--font-label) system-ui"
            lineHeight="var(--lh-label)"
            maxLines={compact ? 3 : 4}
            style={{ fontSize: 'var(--font-label)', color: 'var(--text)', minWidth: 0 }}
            lineStyle={{ whiteSpace: 'normal' }}
          />
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          style={sidebarButtonStyle('#d76482', false, compact)}
          title="Remove marker"
        >
          x
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '18px minmax(0, 1fr)' : '24px minmax(0, 1fr)', gap: compact ? '4px' : '6px', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--font-caption)', lineHeight: 'var(--lh-caption)', color: 'var(--muted)' }}>X</span>
        <input
          value={freqText}
          onChange={(event) => setFreqText(event.target.value)}
          onFocus={(event) => { setFreqFocused(true); setFreqText(String(marker.freq)); event.currentTarget.select(); }}
          onBlur={commitFreq}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.currentTarget.blur(); }
            if (event.key === 'Escape') { setFreqFocused(false); setFreqText(formatTraceXValue(marker.freq, trace, xSpan)); event.currentTarget.blur(); }
          }}
          onClick={(event) => event.stopPropagation()}
          style={{
            width: '100%',
            background: freqFocused ? 'var(--bg)' : 'transparent',
            color: 'var(--text)',
            border: freqFocused
              ? `1px solid ${traceColor}`
              : `1px solid color-mix(in srgb, ${traceColor} 30%, var(--border))`,
            borderRadius: '5px',
            fontSize: 'var(--font-label)',
            lineHeight: 'var(--lh-label)',
            padding: compact ? '0.2rem 0.38rem' : '0.24rem 0.46rem',
            minWidth: 0,
            outline: 'none',
            cursor: 'text',
          }}
        />
      </div>

      <div style={{ display: 'grid', gap: '1px' }}>
        <MR label="Y" value={formatTraceYValue(marker.amp, trace)} vc={traceColor} />
      </div>

      {marker.type === 'delta' && (() => {
        const hasValidRefs = allMarkers.some((m, i) => m.type !== 'delta' && i !== index);
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px', alignItems: 'start', borderTop: '1px solid color-mix(in srgb, var(--accent) 20%, var(--border))', paddingTop: compact ? '3px' : '4px' }}>
            {onUpdateRefIdx && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: 'var(--font-caption)', color: 'var(--accent)' }}>Ref</span>
                <select
                  value={marker.refId ? allMarkers.findIndex(item => item.id === marker.refId) : ''}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    e.stopPropagation();
                    const v = e.target.value === '' ? null : Number(e.target.value);
                    onUpdateRefIdx(v);
                  }}
                  style={{ fontSize: 'var(--font-caption)', padding: '2px 4px', borderRadius: '5px', border: '1px solid var(--accent)', background: 'var(--bg)', color: 'var(--accent)' }}
                >
                  {!hasValidRefs && <option value="">None</option>}
                  {allMarkers.map((m, i) => m.type !== 'delta' && i !== index ? (
                    <option key={i} value={i}>M{i + 1}</option>
                  ) : null)}
                </select>
              </div>
            )}
            <div style={{ display: 'grid', gap: '1px' }}>
              <MR label="ΔF" value={refMarker ? formatTraceXValue(marker.freq - refMarker.freq, trace, xSpan) : '0'} vc="var(--accent)" />
              <MR label="ΔA" value={refMarker ? formatTraceYValue(marker.amp - refMarker.amp, trace) : '0'} vc="var(--accent)" />
            </div>
          </div>
        );
      })()}

      <div style={{ fontSize: 'var(--font-caption)', lineHeight: 'var(--lh-caption)', color: 'var(--dim)' }}>
        {marker.interpolated ? 'interp' : 'snap'}
      </div>
    </div>
  );
}
