import type { InterpolationStrategy } from '../../types/interpolation';
import { useEffect, useState } from 'react';
import type { Trace } from '../../types/trace';
import type { PaneRenderMode } from '../../types/pane';
import { TraceRow as KitTrace } from '../left-panel/Rows';
import { Popover, PopoverAt } from '../shared/Controls';
import { Menu as KitMenu } from '../left-panel/Menu';
import { TraceSymbol } from '../shared/TraceSymbol';
import { useTraceSymbols } from '../../hooks/use-trace-symbols';
import { useTraceState } from '../../stores/trace-store';
import { useUiState } from '../../stores/ui-store';
import { allocateTraceColors, traceWidth } from '../../domain/trace-palette';

export function TraceRow(props: {
  trace: Trace;
  displayName: string;
  subtitle?: string;
  isVisible: boolean;
  isSelected: boolean;
  paneIds: string[];
  panes: { id: string; title: string; type: PaneRenderMode; disabledReason?: string }[];
  onNewPane: () => void;
  newPaneDisabledReason?: string;
  onTogglePane: (paneId: string) => void;
  traceColor: string;
  onSelect: () => void;
  onRemove: () => void;
  onRename: (name: string) => void;
  canResetName: boolean;
  onToggle: () => void;
  onColorChange: (color: string) => void;
  interpolation: InterpolationStrategy;
  sincDisabledReason: string;
  onInterpolationChange: (interpolation: InterpolationStrategy) => void;
  onApplyInterpolation: (interpolation: InterpolationStrategy) => void;
  compact?: boolean;
  removeLabel: string;
}) {
  const { trace, displayName, subtitle, isVisible, isSelected, paneIds, panes, onTogglePane, onNewPane, newPaneDisabledReason, traceColor, onSelect, onRemove, onRename, canResetName, onToggle, onColorChange, interpolation, sincDisabledReason, onInterpolationChange, onApplyInterpolation, removeLabel } = props;
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  useEffect(() => { const start = () => { if (isSelected) setEditing(true); }; window.addEventListener('mergen-rename-trace', start); return () => window.removeEventListener('mergen-rename-trace', start); }, [isSelected]);
  const symbol = useTraceSymbols()(trace.id);
  const { allKnownTraces } = useTraceState();
  const { traceHueSlots } = useUiState();
  const assignment = allocateTraceColors(allKnownTraces, new Map(Object.entries(traceHueSlots))).get(trace.id);
  const labels: Record<InterpolationStrategy, string> = { auto: 'Auto', exact: 'Exact', snap: 'Exact', linear: 'Lin', nearest: 'Near', previous: 'Prev', next: 'Next', cubic: 'Cub', sinc: 'Sinc' };
  const choices: { value: InterpolationStrategy; label: string; note: string }[] = [
    { value: 'auto', label: 'Auto', note: 'Exact where samples exist, linear between' },
    { value: 'exact', label: 'Exact only', note: 'No in-between values; markers always snap' },
    { value: 'linear', label: 'Linear', note: 'Straight line between samples' },
    { value: 'nearest', label: 'Nearest', note: 'Value of the closest sample' },
    { value: 'previous', label: 'Previous', note: 'Holds the sample to the left' },
    { value: 'next', label: 'Next', note: 'Holds the sample to the right' },
    { value: 'cubic', label: 'Cubic spline', note: 'Smooth curve through samples' },
    { value: 'sinc', label: 'Sinc', note: 'Band-limited interpolation on uniform samples' },
  ];
  const interpControl = <span onClick={event => event.stopPropagation()}><Popover label={labels[interpolation]}><KitMenu label="Interpolation" title="Interpolation" checklist entries={choices.map(choice => ({ label: choice.label, note: choice.note, noteBelow: true, checked: interpolation === choice.value || (interpolation === 'snap' && choice.value === 'exact'), disabledReason: choice.value === 'sinc' ? sincDisabledReason || undefined : undefined, onSelect: () => onInterpolationChange(choice.value) }))} footer={<button type="button" className="lp-link" onClick={() => onApplyInterpolation(interpolation)}>Apply to all traces from this file</button>} /></Popover></span>;
  const paneLabels = panes.filter(pane => paneIds.includes(pane.id)).map(pane => ({ id: pane.id, label: `P${panes.findIndex(item => item.id === pane.id) + 1}` }));
  const panesControl = <span className="lp-pane-trigger" style={{ width: Math.max(20, paneIds.length * 19 - 3) }} title="Show in panes" onClick={event => event.stopPropagation()}><Popover label={paneLabels.length ? paneLabels.map(item => item.label).join(' ') : '—'}><KitMenu label="Show in" title="Show in" style={{ width: 220 }} checklist entries={[...panes.map(pane => ({ id: pane.id, label: `${pane.title} · ${{ cartesian: 'Chart', smith: 'Smith', 'smith-inverted': 'Smith', table: 'Table' }[pane.type]}`, note: pane.disabledReason, checked: paneIds.includes(pane.id), disabledReason: pane.disabledReason, noteBelow: true, onSelect: () => onTogglePane(pane.id) })), { id: 'new-pane', label: 'New pane', command: true, disabledReason: newPaneDisabledReason, onSelect: onNewPane }]} /></Popover><span className="lp-pane-trigger__face" aria-hidden="true">{paneLabels.length ? paneLabels.map(item => <span className="lp-pane" key={item.id}>{item.label}</span>) : <span className="lp-pane lp-pane--none">&#8212;</span>}</span></span>;
  return <div data-testid={`trace-row-${trace.name}`} tabIndex={0} onKeyDown={event => { if (event.key === 'F2' && !editing) { event.preventDefault(); event.stopPropagation(); setEditing(true); } }} draggable={!editing} onDragStart={event => { event.dataTransfer.setData('application/x-mergen-trace', trace.name); event.dataTransfer.setData('text/plain', trace.name); event.dataTransfer.effectAllowed = 'move'; }} title={removeLabel}>
    <KitTrace hue={270} color={traceColor} name={displayName} subline={subtitle} interp={labels[interpolation] as 'Auto' | 'Exact' | 'Lin' | 'Near' | 'Prev' | 'Next' | 'Cub' | 'Sinc'} panes={paneLabels.map(item => item.label)} visible={isVisible} selected={isSelected} created={trace.kind === 'derived'} child={trace.kind === 'derived'} onVisible={onToggle} onSelect={onSelect} onInterp={() => {}} onPanes={() => {}} onRename={() => setEditing(true)} editingName={editing} onCommitName={value => { setEditing(false); onRename(value); }} onCancelName={() => setEditing(false)} onRemove={onRemove} interpControl={interpControl} panesControl={panesControl}
      actionsControl={<button type="button" className="lp-icon-btn" aria-label={`Trace menu: ${displayName}`} onClick={event => { event.stopPropagation(); setMenu(event.currentTarget); }}>⋯</button>}
      swatch={<span className={`lp-swatch lp-color-control${symbol !== null ? ' lp-swatch--symbol' : ''}`} style={symbol === null ? { background: isVisible ? traceColor : 'transparent', border: isVisible ? undefined : `1.5px solid ${traceColor}` } : undefined}>{symbol !== null && <svg width="16" height="12" viewBox="-8 -6 16 12" style={{ overflow: 'visible' }}><line x1="-8" y1="0" x2="8" y2="0" stroke={traceColor} strokeWidth={assignment ? traceWidth(assignment) : 1.5} opacity={isVisible ? 1 : 0.4} /><TraceSymbol kind={symbol} color={traceColor} background="var(--panel)" /></svg>}<input type="color" value={traceColor} title="Trace color" onClick={event => event.stopPropagation()} onChange={event => onColorChange(event.target.value)} /></span>} />
    {menu && <PopoverAt label="Trace actions" at={menu} onClose={() => setMenu(null)}><KitMenu label="Trace actions" entries={[{ label: 'Rename', onSelect: () => { setMenu(null); setEditing(true); } }, ...(canResetName ? [{ label: 'Reset name', onSelect: () => { setMenu(null); onRename(''); } }] : [])]} /></PopoverAt>}
  </div>;
}
