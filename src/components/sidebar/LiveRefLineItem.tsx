import React from 'react';
import type { LineIntersection } from '../../domain/ref-lines';
import type { RefLine } from '../../types/ref-line';
import type { ThemeColors } from '../../types/theme';
import type { Trace } from '../../types/trace';
import { badgeStyle, formatRefLineValue, formatTraceXValue, formatWithUnit, parseEngineeringInput, sidebarButtonStyle } from './live-row-helpers';

export function RefLineItem(props: {
  refLine: RefLine;
  isSelected: boolean;
  intersections: LineIntersection[];
  allPanes: readonly { id: string; title: string }[];
  siblingLines: RefLine[];
  onSelect: () => void;
  onRemove: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onUpdateValue: (value: number) => void;
  onUpdateDeltaPartner: (partnerId: number | null) => void;
  selectedTrace: Trace | null;
  xSpan: number;
  compact?: boolean;
  colors?: ThemeColors | null;
  resolveTraceColor: (traceName: string) => string;
}) {
  const { refLine, isSelected, intersections, allPanes, siblingLines, onSelect, onRemove, onLock, onUnlock, onUpdateValue, onUpdateDeltaPartner, selectedTrace, xSpan, compact = false, colors, resolveTraceColor } = props;
  const accentColor = refLine.type === 'v' ? (colors?.refV ?? '#d48a2b') : (colors?.refH ?? '#2b9ab7');
  const isLocked = refLine.groupId != null;

  const [focused, setFocused] = React.useState(false);
  const [editText, setEditText] = React.useState('');

  // Sync display text when not focused
  React.useEffect(() => {
    if (!focused) setEditText(formatRefLineValue(refLine, selectedTrace, xSpan));
  }, [refLine.value, focused, selectedTrace, xSpan]);

  const commitEdit = () => {
    setFocused(false);
    const parsed = parseEngineeringInput(editText, selectedTrace);
    if (parsed != null && Number.isFinite(parsed)) onUpdateValue(parsed);
    else setEditText(formatRefLineValue(refLine, selectedTrace, xSpan)); // revert bad input
  };

  // Group intersections by pane
  const byPane: Record<string, LineIntersection[]> = {};
  for (const ix of intersections) {
    (byPane[ix.paneId] ??= []).push(ix);
  }

  const lineLabel = refLine.label ?? (refLine.type === 'v' ? 'V' : 'H');

  return (
    <div
      data-testid={`ref-line-row-${refLine.label ?? refLine.id}`}
      onClick={onSelect}
      style={{
        border: `1px solid ${isSelected ? accentColor : `color-mix(in srgb, ${accentColor} 18%, var(--border))`}`,
        borderRadius: compact ? '7px' : '8px',
        padding: compact ? '4px 5px' : '5px 6px',
        background: isSelected
          ? `color-mix(in srgb, ${accentColor} 12%, white)`
          : `color-mix(in srgb, ${accentColor} 5%, white)`,
        boxShadow: `inset 3px 0 0 ${accentColor}`,
        display: 'grid',
        gap: compact ? '2px' : '3px',
        cursor: 'pointer',
        minWidth: 0,
      }}
    >
      {/* Row 1: name badge + value input + lock icon + remove */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto auto', gap: compact ? '4px' : '6px', alignItems: 'center', minWidth: 0 }}>
        <span style={{
          ...badgeStyle,
          borderColor: accentColor,
          background: isSelected ? accentColor : 'transparent',
          color: isSelected ? '#fff' : accentColor,
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          padding: '1px 6px',
        }}>{lineLabel}</span>
        <input
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onFocus={(e) => {
            setFocused(true);
            setEditText(String(refLine.value));
            e.currentTarget.select();
          }}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') { setFocused(false); setEditText(formatRefLineValue(refLine, selectedTrace, xSpan)); e.currentTarget.blur(); }
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-caption)',
            background: focused ? 'var(--bg)' : 'transparent',
            border: focused ? `1px solid ${accentColor}` : `1px solid color-mix(in srgb, ${accentColor} 30%, var(--border))`,
            borderRadius: '4px',
            padding: '2px 6px',
            color: 'var(--text)',
            minWidth: 0,
            width: '100%',
            cursor: 'text',
            outline: 'none',
          }}
        />
        {isLocked && (
          <span style={{ fontSize: '10px', color: 'var(--dim)', userSelect: 'none' }} title="Locked across panes">🔒</span>
        )}
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onRemove(); }}
          style={sidebarButtonStyle('#d76482', false, compact)}
          title="Remove reference line"
        >
          x
        </button>
      </div>

      {/* Row 2: lock/unlock controls + delta toggle when selected */}
      {isSelected && (
        <div style={{ display: 'flex', gap: '4px', marginTop: '1px', alignItems: 'center' }}>
          {allPanes.length > 1 && (!isLocked ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onLock(); }}
              disabled={refLine.type === 'h'}
              title={refLine.type === 'h' ? 'Only vertical lines can be linked.' : 'Link panes with the same X unit'}
              style={{ ...sidebarButtonStyle(accentColor, false, compact), fontSize: '10px' }}
            >
              Lock All Panes
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onUnlock(); }}
              style={{ ...sidebarButtonStyle(accentColor, false, compact), fontSize: '10px' }}
            >
              Unlock
            </button>
          ))}
          {siblingLines.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: 'var(--muted)', marginLeft: 'auto' }} onClick={e => e.stopPropagation()}>
              <span>Δ</span>
              <select
                value={refLine.deltaPartnerId ?? ''}
                onChange={e => onUpdateDeltaPartner(e.target.value ? Number(e.target.value) : null)}
                style={{ fontSize: '10px', padding: '1px 3px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer' }}
              >
                <option value="">none</option>
                {siblingLines.map(sl => (
                  <option key={sl.id} value={sl.id}>{sl.label ?? sl.id}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Intersections */}
      {intersections.length > 0 && (
        <div style={{ display: 'grid', gap: '1px', marginTop: '2px' }}>
          {Object.entries(byPane).map(([pid, ixs]) => (
            <div key={pid}>
              {allPanes.length > 1 && (
                <div style={{ fontSize: '9px', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: '1px', paddingLeft: '2px' }}>
                  {pid.replace('pane-', 'P')}
                </div>
              )}
              {ixs.map((ix, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', gap: '5px', alignItems: 'center', paddingLeft: allPanes.length > 1 ? '8px' : '0', minWidth: 0 }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: resolveTraceColor(ix.traceName), flexShrink: 0, border: '1px solid rgba(255,255,255,0.25)' }} />
                  <span style={{ fontSize: 'var(--font-caption)', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ix.traceName}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-caption)', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                    {refLine.type === 'v'
                      ? formatWithUnit(ix.amp, selectedTrace?.units.y ?? null)
                      : formatTraceXValue(ix.freq, selectedTrace, xSpan)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
