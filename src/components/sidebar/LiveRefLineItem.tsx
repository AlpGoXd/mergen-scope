import React from 'react';
import type { LineIntersection } from '../../domain/ref-lines';
import { decodeXAxisUnit } from '../../types/ref-line';
import type { RefLine } from '../../types/ref-line';
import type { ThemeColors } from '../../types/theme';
import type { Trace } from '../../types/trace';
import { formatRefLineValue, formatWithUnit, parseEngineeringInput } from './live-row-helpers';
import { parseEngInput } from '../../domain/units';
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
  onUpdateValue: (value: number) => void;
  onUpdateDeltaPartner: (partnerId: number | null) => void;
  selectedTrace: Trace | null;
  xSpan: number;
  compact?: boolean;
  colors?: ThemeColors | null;
  resolveTraceColor: (traceName: string) => string;
}) {
  const { refLine, intersections, allPanes, linkedPaneIds, onList, onSelect, onRemove, onUpdateValue, selectedTrace, xSpan } = props;
  const [invalid, setInvalid] = React.useState(false);
  const label = refLine.label ?? (refLine.type === 'v' ? 'V' : 'H');
  const savedUnit = refLine.paneIds.length === 0 && refLine.axisUnit ? (refLine.type === 'v' ? decodeXAxisUnit(refLine.axisUnit)[1] : refLine.axisUnit) : null;
  const value = savedUnit ? formatWithUnit(refLine.value, savedUnit) : formatRefLineValue(refLine, selectedTrace, xSpan);
  const summary = refLine.paneIds.length === 0 ? 'Not in a pane' : `${linkedPaneIds.map(id => { const index = allPanes.findIndex(pane => pane.id === id); return index >= 0 ? `P${index + 1}` : id; }).join(' + ') || '\u2014'} (${refLine.type === 'v' ? selectedTrace?.units.x ?? 'X' : selectedTrace?.units.y ?? 'Y'}) \u00b7 ${intersections.length} ${intersections.length === 1 ? 'crossing' : 'crossings'}`;
  return <div data-testid={`ref-line-row-${refLine.label ?? refLine.id}`} onClick={onSelect}>
    <LineRow key={`${refLine.id}:${value}`} label={label} value={value} summary={summary} invalid={invalid}
      onValue={text => { let result = savedUnit ? parseEngInput(text, {baseUnit:savedUnit}) : null; if (result && !result.ok && result.reason === 'unknown-unit' && savedUnit && text.trim().endsWith(savedUnit)) result = parseEngInput(text.trim().slice(0, -savedUnit.length)); const parsed = result ? (result.ok ? result.value : null) : parseEngineeringInput(text, selectedTrace); if (parsed == null || !Number.isFinite(parsed)) setInvalid(true); else { setInvalid(false); onUpdateValue(parsed); } }}
      onListCrossings={() => onList?.()} onRemove={onRemove} />
  </div>;
}
