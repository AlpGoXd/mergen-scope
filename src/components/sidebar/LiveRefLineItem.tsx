import React from 'react';
import type { LineIntersection } from '../../domain/ref-lines';
import type { RefLine } from '../../types/ref-line';
import type { ThemeColors } from '../../types/theme';
import type { Trace } from '../../types/trace';
import { badgeStyle, formatRefLineValue, parseEngineeringInput, sidebarButtonStyle } from './live-row-helpers';

export function RefLineItem(props: {
  refLine: RefLine;
  isSelected: boolean;
  intersections: LineIntersection[];
  allPanes: readonly { id: string; title: string }[];
  linkedPaneIds: string[];
  siblingLines: RefLine[];
  onSelect: () => void;
  onList?: () => void;
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
  const { refLine, isSelected, intersections, allPanes, linkedPaneIds, onList, onSelect, onRemove, onLock, onUnlock, onUpdateValue, selectedTrace, xSpan, compact = false } = props;
  const accentColor = 'var(--text-muted)';
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

  const lineLabel = refLine.label ?? (refLine.type === 'v' ? 'V' : 'H');

  return (
    <div
      data-testid={`ref-line-row-${refLine.label ?? refLine.id}`}
      onClick={onSelect}
      style={{
        border: `1px solid ${isSelected ? accentColor : `color-mix(in srgb, ${accentColor} 18%, var(--border))`}`,
        borderRadius: compact ? '7px' : '8px',
        padding: compact ? '4px 5px' : '5px 6px',
        background: 'var(--raised)',
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
          border: '1px dashed var(--text-muted)',
          background: 'transparent',
          color: 'var(--text-muted)',
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
        <button type="button" disabled={refLine.type === 'h' || (!isLocked && allPanes.length < 2)}
          title={refLine.type === 'h' ? 'Only vertical lines can be linked.' : allPanes.length < 2 && !isLocked ? 'Add another compatible pane to link.' : isLocked ? 'Unlink line' : 'Link panes with the same X unit'}
          onClick={(event) => { event.stopPropagation(); isLocked ? onUnlock() : onLock(); }}
          style={{ ...sidebarButtonStyle(isLocked ? 'var(--accent)' : 'var(--text-muted)', false, compact), opacity: refLine.type === 'h' ? .45 : 1 }}>↗</button>
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onRemove(); }}
          style={sidebarButtonStyle('var(--text-muted)', false, compact)}
          title="Remove reference line"
        >
          x
        </button>
      </div>

      <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-caption)', display: 'flex', gap: 4 }}>
        <span style={{ flex: 1 }}>{linkedPaneIds.map(id => { const index = allPanes.findIndex(pane => pane.id === id); return index >= 0 ? `P${index + 1}` : id; }).join(' + ') || '\u2014'}{isLocked ? ' (linked, ' : ' ('}{refLine.type === 'v' ? selectedTrace?.units.x ?? 'X' : selectedTrace?.units.y ?? 'Y'}) {'\u00b7'} {intersections.length} {intersections.length === 1 ? 'crossing' : 'crossings'}</span>
        <button type="button" disabled={!onList} title={onList ? 'Open threshold crossings' : 'Threshold crossings will be available in Analysis'} onClick={event => { event.stopPropagation(); onList?.(); }}>List…</button>
      </div>
    </div>
  );
}
