import { useState } from 'react';
import type { Marker } from '../../types/marker';
import type { Trace } from '../../types/trace';
import { formatTraceXValue, formatTraceYValue, parseEngineeringInput } from './live-row-helpers';
import { MarkerItem as KitMarker } from '../left-panel/Rows';
import { Menu } from '../shared/Controls';

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
  const { marker, index, trace, traceColor, xSpan, isSelected, isVisible = true, isRelated = false, onHover, paneNumbers, onSelect, onRemove, onUpdateFreq, paneNumber, refMarker = null, allMarkers = [], onUpdateRefIdx } = props;
  const [invalid, setInvalid] = useState(false);
  const deltaOffset = marker.type === 'delta' && refMarker ? marker.freq - refMarker.freq : null;
  const x = `${deltaOffset != null && deltaOffset >= 0 ? '+' : ''}${formatTraceXValue(deltaOffset ?? marker.freq, trace, xSpan)}`;
  const referenceControl = onUpdateRefIdx && <span onClick={event => event.stopPropagation()}><Menu label={refMarker?.label ?? (refMarker ? `M${allMarkers.findIndex(item => item.id === refMarker.id) + 1}` : 'Reference')} items={allMarkers.flatMap((item, i) => item.type !== 'delta' && i !== index ? [{ label: item.label ?? `M${i + 1}`, onSelect: () => onUpdateRefIdx(i) }] : [])} /></span>;
  return <div data-testid={`marker-row-${index + 1}`} onMouseEnter={() => onHover?.(true)} onMouseLeave={() => onHover?.(false)} style={{ opacity: isVisible ? 1 : .45 }}>
    <KitMarker key={`${marker.id}:${x}`} label={marker.label ?? `${marker.type === 'delta' ? 'D' : 'M'}${index + 1}`} hue={270} color={traceColor} x={x} y={formatTraceYValue(marker.amp, trace)} traceName={trace?.dn ?? marker.trace}
      panes={(paneNumbers?.length ? paneNumbers : [paneNumber]).map(n => `P${n}`)} mode={marker.interpolated ? 'interp' : 'snap'} selected={isSelected} related={isRelated} invalid={invalid} referenceControl={referenceControl}
      delta={marker.type === 'delta' ? { from: refMarker?.label ?? 'M', fromHue: 270, at: refMarker ? formatTraceXValue(refMarker.freq, trace, xSpan) : '\u2014', onChangeRef: () => {} } : undefined}
      onX={text => { const parsed = parseEngineeringInput(text, trace); if (parsed == null) setInvalid(true); else { setInvalid(false); onUpdateFreq(deltaOffset != null && refMarker ? refMarker.freq + parsed : parsed); } }} onSelect={onSelect} onRemove={onRemove} />
  </div>;
}
