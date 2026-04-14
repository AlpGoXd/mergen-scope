import type { Marker } from '../../types/marker';
import type { Trace } from '../../types/trace';

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
}

export function MarkerItem({ marker, index, traceColor, isSelected, onSelect, onRemove, compact }: MarkerItemProps) {
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
        gap: '2px',
        position: 'relative'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ color: 'var(--text)' }}>M{index + 1} {marker.interpolated ? '(intp)' : ''}</strong>
        <span 
          title="Remove Marker"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{ cursor: 'pointer', color: 'var(--dim)', padding: '0 4px', fontSize: '1.2em' }}
        >
          ×
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', color: 'var(--muted)' }}>
        <span><strong style={{ color: 'var(--text)' }}>Freq:</strong> {marker.freq.toExponential(4)}</span>
        <span><strong style={{ color: 'var(--text)' }}>Amp:</strong> {marker.amp.toFixed(3)}</span>
      </div>
    </div>
  );
}
