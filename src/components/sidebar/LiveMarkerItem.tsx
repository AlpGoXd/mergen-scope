import { useEffect, useState } from 'react';
import type { Marker } from '../../types/marker';
import type { Trace } from '../../types/trace';
import { badgeStyle, formatTraceXValue, formatTraceYValue, parseEngineeringInput, sidebarButtonStyle } from './live-row-helpers';

export function MarkerItem(props: {
  marker: Marker;
  index: number;
  trace: Trace | null;
  traceColor: string;
  xSpan: number;
  isSelected: boolean;
  isVisible?: boolean;
  isRelated?: boolean;
  onHover?: (hovered: boolean) => void;
  paneNumbers?: number[];
  onSelect: () => void;
  onRemove: () => void;
  compact?: boolean;
  onUpdateFreq: (freq: number) => void;
  paneNumber: number;
  refMarker?: Marker | null;
  allMarkers?: Marker[];
  onUpdateRefIdx?: (refIdx: number | null) => void;
}) {
  const { marker, index, trace, traceColor, xSpan, isSelected, isVisible = true, isRelated = false, onHover, paneNumbers, onSelect, onRemove, compact = false, onUpdateFreq, paneNumber, refMarker = null, allMarkers = [], onUpdateRefIdx } = props;
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
    <div data-testid={`marker-row-${index + 1}`} onClick={onSelect} onMouseEnter={() => onHover?.(true)} onMouseLeave={() => onHover?.(false)} style={{ border: `1px solid ${isSelected || isRelated ? traceColor : 'var(--border)'}`, borderRadius: 6, padding: '3px 5px', background: 'var(--raised)', display: 'grid', gap: 2, cursor: 'pointer', minWidth: 0, opacity: isVisible ? 1 : .45 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto auto', gap: 4, alignItems: 'center' }}>
        <span style={{ ...badgeStyle, borderColor: traceColor, background: marker.type === 'delta' ? `color-mix(in srgb, ${traceColor} 12%, var(--raised))` : traceColor, color: marker.type === 'delta' ? traceColor : 'var(--raised)', fontFamily: 'var(--font-mono)' }}>{marker.label ?? `${marker.type === 'delta' ? 'D' : 'M'}${index + 1}`}</span>
        <input aria-label="Marker X" value={freqText} onChange={event => setFreqText(event.target.value)} onFocus={event => { setFreqFocused(true); setFreqText(String(marker.freq)); event.currentTarget.select(); }} onBlur={commitFreq} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setFreqFocused(false); setFreqText(formatTraceXValue(marker.freq, trace, xSpan)); event.currentTarget.blur(); } }} onClick={event => event.stopPropagation()} style={{ minWidth: 0, width: '100%', fontFamily: 'var(--font-mono)', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-caption)', whiteSpace: 'nowrap' }}>{formatTraceYValue(marker.amp, trace)}</span>
        <button type="button" onClick={event => { event.stopPropagation(); onRemove(); }} style={sidebarButtonStyle('var(--text-muted)', false, compact)} title="Remove marker">×</button>
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-caption)', display: 'flex', gap: 4, alignItems: 'center', minWidth: 0 }}>
        {marker.type === 'delta' && onUpdateRefIdx ? <span>from <select aria-label="Reference marker" value={marker.refId ? allMarkers.findIndex(item => item.id === marker.refId) : ''} onClick={event => event.stopPropagation()} onChange={event => onUpdateRefIdx(event.target.value === '' ? null : Number(event.target.value))}>{allMarkers.map((item, i) => item.type !== 'delta' && i !== index ? <option key={item.id} value={i}>M{i + 1}</option> : null)}</select> · at {refMarker ? formatTraceXValue(refMarker.freq, trace, xSpan) : '—'}</span> : <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={trace?.dn ?? marker.trace}>{trace?.dn ?? marker.trace}</span>}
        {(paneNumbers?.length ? paneNumbers : [paneNumber]).map(number => <span key={number} style={badgeStyle}>P{number}</span>)}<span>{marker.interpolated ? '≈ interp' : '● snap'}</span>
      </div>
    </div>
  );
}
