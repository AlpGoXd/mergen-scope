import type { InterpolationStrategy } from '../../types/interpolation';
import type { Trace } from '../../types/trace';
import { badgeStyle, sidebarButtonStyle } from './live-row-helpers';

export function TraceRow(props: {
  trace: Trace;
  isVisible: boolean;
  isSelected: boolean;
  paneId?: string;
  traceColor: string;
  onSelect: () => void;
  onRemove: () => void;
  onToggle: () => void;
  onColorChange: (color: string) => void;
  interpolation: InterpolationStrategy;
  sincDisabledReason: string;
  onInterpolationChange: (interpolation: InterpolationStrategy) => void;
  compact?: boolean;
  removeLabel: string;
}) {
  const {
    trace,
    isVisible,
    isSelected,
    paneId,
    traceColor,
    onSelect,
    onRemove,
    onToggle,
    onColorChange,
    interpolation,
    sincDisabledReason,
    onInterpolationChange,
    compact = false,
    removeLabel,
  } = props;
  const selectTitle = sincDisabledReason || 'Trace interpolation';

  return (
    <div
      data-testid={`trace-row-${trace.name}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-mergen-trace', trace.name);
        e.dataTransfer.setData('text/plain', trace.name);
        e.dataTransfer.effectAllowed = 'move';
      }}
      style={{
        display: 'grid',
        gridColumn: '1 / -1',
        gridTemplateColumns: 'subgrid',
        alignItems: 'center',
        minWidth: 0,
        padding: compact ? '2px 5px' : '3px 6px',
        borderRadius: compact ? '7px' : '8px',
        border: `1px solid ${isSelected ? 'var(--text)' : 'var(--border)'}`,
        background: isSelected
          ? `color-mix(in srgb, ${traceColor} 10%, var(--card))`
          : 'var(--card)',
        boxShadow: isSelected ? `inset 3px 0 0 ${traceColor}` : 'none',
        cursor: 'grab',
      }}
      onClick={onSelect}
      title={trace.dn}
    >
      <input
        type="checkbox"
        checked={isVisible}
        onChange={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        title={isVisible ? 'Hide trace' : 'Show trace'}
      />
      <input
        type="color"
        value={traceColor}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onColorChange(event.target.value)}
        title="Trace color"
        style={{
          width: compact ? '12px' : '14px',
          height: compact ? '12px' : '14px',
          border: trace.kind === 'derived' ? '1px dashed var(--muted)' : '1px solid var(--border)',
          borderRadius: '4px',
          padding: 0,
          background: 'transparent',
          cursor: 'pointer',
        }}
      />
      <div style={{ minWidth: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span
          title={trace.dn}
          style={{
            fontSize: 'var(--font-label)',
            color: traceColor,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
            flex: 1,
          }}
        >
          {trace.dn}
        </span>
        {trace.kind === 'derived' && (
          <span style={{ ...badgeStyle, borderColor: `color-mix(in srgb, ${traceColor} 30%, var(--border))`, color: traceColor, flexShrink: 0 }}>
            fx
          </span>
        )}
      </div>
      {paneId && <span style={badgeStyle}>{paneId.replace('pane-', 'P')}</span>}
      <select
        value={interpolation}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onInterpolationChange(event.target.value as InterpolationStrategy)}
        title={selectTitle}
        style={{
          background: 'rgba(255,255,255,0.98)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: '5px',
          fontSize: 'var(--font-caption)',
          lineHeight: 'var(--lh-caption)',
          padding: compact ? '0.18rem 0.28rem' : '0.22rem 0.34rem',
          minWidth: compact ? '58px' : '70px',
        }}
      >
        <option value="snap">Snap</option>
        <option value="linear">Linear</option>
        <option value="sinc" disabled={!!sincDisabledReason}>
          Sinc
        </option>
      </select>
      <span style={{ fontSize: 'var(--font-caption)', lineHeight: 'var(--lh-caption)', color: 'var(--dim)' }}>
        {trace.kind === 'derived' ? 'd' : 'r'}
      </span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        style={sidebarButtonStyle('#d76482', false, compact)}
        title={removeLabel}
      >
        x
      </button>
    </div>
  );
}
