import React from 'react';
import type { LineIntersection } from '../../domain/ref-lines';
import type { RefLine } from '../../types/ref-line';
import type { ThemeColors } from '../../types/theme';
import type { Trace } from '../../types/trace';
import { formatRefLineValue, parseEngineeringInput } from './live-row-helpers';
import { LineRow } from '../left-panel/Rows';

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
  const { refLine, intersections, allPanes, linkedPaneIds, onList, onSelect, onRemove, onLock, onUnlock, onUpdateValue, selectedTrace, xSpan } = props;
  const [invalid, setInvalid] = React.useState(false);
  const isLocked = refLine.groupId != null;
  const label = refLine.label ?? (refLine.type === 'v' ? 'V' : 'H');
  const value = formatRefLineValue(refLine, selectedTrace, xSpan);
  const summary = `${linkedPaneIds.map(id => { const index = allPanes.findIndex(pane => pane.id === id); return index >= 0 ? `P${index + 1}` : id; }).join(' + ') || '\u2014'}${isLocked ? ' (linked, ' : ' ('}${refLine.type === 'v' ? selectedTrace?.units.x ?? 'X' : selectedTrace?.units.y ?? 'Y'}) \u00b7 ${intersections.length} ${intersections.length === 1 ? 'crossing' : 'crossings'}`;
  const unavailable = refLine.type === 'h' || (!isLocked && allPanes.length < 2);
  return <div data-testid={`ref-line-row-${refLine.label ?? refLine.id}`} onClick={onSelect}>
    <LineRow key={`${refLine.id}:${value}`} label={label} value={value} summary={summary} invalid={invalid}
      link={unavailable ? 'na' : isLocked ? 'on' : 'off'}
      linkReason={refLine.type === 'h' ? 'Only vertical lines can be linked.' : 'Add another compatible pane to link.'}
      onValue={text => { const parsed = parseEngineeringInput(text, selectedTrace); if (parsed == null || !Number.isFinite(parsed)) setInvalid(true); else { setInvalid(false); onUpdateValue(parsed); } }}
      onLink={() => isLocked ? onUnlock() : onLock()} onListCrossings={() => onList?.()} onRemove={onRemove} />
  </div>;
}
