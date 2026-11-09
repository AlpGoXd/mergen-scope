import type { InterpolationStrategy } from '../../types/interpolation';
import type { Trace } from '../../types/trace';
import { TraceRow as KitTrace } from '../left-panel/Rows';
import { Popover } from '../shared/Controls';
import { Menu as KitMenu } from '../left-panel/Menu';

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
  onRename: () => void;
  onToggle: () => void;
  onColorChange: (color: string) => void;
  interpolation: InterpolationStrategy;
  sincDisabledReason: string;
  onInterpolationChange: (interpolation: InterpolationStrategy) => void;
  onApplyInterpolation: (interpolation: InterpolationStrategy) => void;
  compact?: boolean;
  removeLabel: string;
}) {
  const { trace, displayName, subtitle, isVisible, isSelected, paneIds, panes, onTogglePane, traceColor, onSelect, onRemove, onRename, onToggle, onColorChange, interpolation, sincDisabledReason, onInterpolationChange, onApplyInterpolation, removeLabel } = props;
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
  const panesControl = <span className="lp-pane-trigger" style={{ width: Math.max(20, paneIds.length * 19 - 3) }} title="Show in panes" onClick={event => event.stopPropagation()}><Popover label={paneIds.length ? paneIds.map(id => id.replace('pane-', 'P')).join(' ') : '\u2014'}><strong>Show in</strong>{panes.map(pane => <label key={pane.id} title={pane.disabledReason} style={{ display: 'flex', gap: 4, whiteSpace: 'nowrap' }}><input type="checkbox" checked={paneIds.includes(pane.id)} disabled={!!pane.disabledReason} onChange={() => onTogglePane(pane.id)} />{pane.title}</label>)}</Popover><span className="lp-pane-trigger__face" aria-hidden="true">{paneIds.length ? paneIds.map(id => <span className="lp-pane" key={id}>{id.replace('pane-', 'P')}</span>) : <span className="lp-pane lp-pane--none">&#8212;</span>}</span></span>;
  return <div data-testid={`trace-row-${trace.name}`} draggable onDragStart={event => { event.dataTransfer.setData('application/x-mergen-trace', trace.name); event.dataTransfer.setData('text/plain', trace.name); event.dataTransfer.effectAllowed = 'move'; }} title={removeLabel}>
    <KitTrace hue={270} color={traceColor} name={displayName} subline={subtitle} interp={labels[interpolation] as 'Auto' | 'Exact' | 'Lin' | 'Near' | 'Prev' | 'Next' | 'Cub' | 'Sinc'} panes={paneIds.map(id => id.replace('pane-', 'P'))} visible={isVisible} selected={isSelected} created={trace.kind === 'derived'} child={trace.kind === 'derived'} onVisible={onToggle} onSelect={onSelect} onInterp={() => {}} onPanes={() => {}} onRename={onRename} onRemove={onRemove} interpControl={interpControl} panesControl={panesControl}
      swatch={<span className="lp-swatch lp-color-control" style={{ background: isVisible ? traceColor : 'transparent', border: isVisible ? undefined : `1.5px solid ${traceColor}` }}><input type="color" value={traceColor} title="Trace color" onClick={event => event.stopPropagation()} onChange={event => onColorChange(event.target.value)} /></span>} />
  </div>;
}
