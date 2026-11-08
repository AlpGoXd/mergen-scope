import type { InterpolationStrategy } from '../../types/interpolation';
import type { Trace } from '../../types/trace';
import { badgeStyle, sidebarButtonStyle } from './live-row-helpers';

export function TraceRow(props: {
  trace: Trace;
  displayName: string;
  subtitle?: string;
  isVisible: boolean;
  isSelected: boolean;
  paneIds: string[];
  panes: { id: string; title: string; disabledReason?: string }[];
  onTogglePane: (paneId: string) => void;
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
    displayName,
    subtitle,
    isVisible,
    isSelected,
    paneIds,
    panes,
    onTogglePane,
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
        gridTemplateColumns: 'auto auto minmax(0, 1fr) auto auto auto',
        gap: '4px',
        alignItems: 'center',
        minWidth: 0,
        padding: compact ? '2px 5px' : '3px 6px',
        borderRadius: compact ? '7px' : '8px',
        border: `1px solid ${isSelected ? traceColor : 'var(--border)'}`,
        background: isSelected
          ? `color-mix(in srgb, ${traceColor} 10%, var(--card))`
          : 'var(--card)',
        opacity: isVisible ? 1 : 0.55,
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
          {displayName.length > 24 ? `${displayName.slice(0, 12)}…${displayName.slice(-9)}` : displayName}
        </span>
        {trace.kind === 'derived' && (
          <span style={{ ...badgeStyle, borderColor: `color-mix(in srgb, ${traceColor} 30%, var(--border))`, color: traceColor, flexShrink: 0 }}>
            fx
          </span>
        )}
      </div>
      
      <select
        value={interpolation}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onInterpolationChange(event.target.value as InterpolationStrategy)}
        title={selectTitle}
        style={{
          background: 'var(--raised)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: '5px',
          fontSize: 'var(--font-caption)',
          lineHeight: 'var(--lh-caption)',
          minWidth: 0,
          width: '52px',
          padding: '1px',
        }}
      >
        <option value="snap">Snap</option>
        <option value="linear">Linear</option>
        <option value="sinc" disabled={!!sincDisabledReason}>
          Sinc
        </option>
      </select>
      <details onClick={(event) => event.stopPropagation()} style={{ position: 'relative' }}>
        <summary title="Show in panes" style={{ ...badgeStyle, cursor: 'pointer', whiteSpace: 'nowrap' }}>{paneIds.length ? paneIds.map(id => id.replace('pane-', 'P')).join(' ') : '—'}</summary>
        <div style={{ position: 'absolute', zIndex: 5, right: 0, minWidth: 150, padding: 6, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--raised)', boxShadow: '0 4px 12px oklch(0 0 0 / .15)' }}>
          <strong>Show in</strong>
          {panes.map(pane => <label key={pane.id} title={pane.disabledReason} style={{ display: 'flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap', opacity: pane.disabledReason ? .45 : 1 }}>
            <input type="checkbox" checked={paneIds.includes(pane.id)} disabled={!!pane.disabledReason} onChange={() => onTogglePane(pane.id)} />{pane.title}
          </label>)}
        </div>
      </details>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        style={sidebarButtonStyle('var(--text-muted)', false, compact)}
        title={removeLabel}
      >
        x
      </button>
      {subtitle && <span style={{ gridColumn: '3 / -1', color: 'var(--text-muted)', fontSize: 'var(--font-caption)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</span>}
    </div>
  );
}

