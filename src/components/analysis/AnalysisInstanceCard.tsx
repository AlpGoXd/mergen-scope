// One analysis instance rendered with the Analysis kit (AC-3): generic over the registry tool.
// The tool's params become the generated form, its outputs become key/value rows, a headline result,
// crossings, or a created trace row. All formatting comes from domain/analysis/card-view.ts.
import { useMemo, useState } from 'react';
import './kit/analysis.css';
import { AnalysisCard, Busy, CardMsg, CrossingsList, KeyValues, OutputRow, Params, Result } from './kit/Analysis';
import type { ParamField } from './kit/types';
import { Menu as KitMenu } from '../left-panel/Menu';
import { PopoverAt } from '../shared/Controls';
import { useAnalysisContext } from '../../hooks/use-analysis-context';
import { useAnalysisDispatch, useAnalysisState } from '../../stores/analysis-store';
import { useOptionalAggregateWorkspace } from '../../stores/aggregate-workspace-store';
import { useTraceState } from '../../stores/trace-store';
import { useUiDispatch } from '../../stores/ui-store';
import { getAnalysisTool } from '../../domain/analysis/tool-registry';
import { computeInstance } from '../../domain/analysis/instances';
import { crossingsCsv, describeCrossings, describeNumbers, resultsText } from '../../domain/analysis/card-view';
import type { CardUnits } from '../../domain/analysis/card-view';
import { formatCrossingValue, significantStep } from '../../domain/analysis/crossing-rows';
import { oklchHue } from '../../domain/color-hue';
import { parseEngInput } from '../../domain/units';
import type { AnalysisInstance } from '../../types/analysis-instance';
import type { AnalysisTool, ParameterField, ParameterSchema, ParameterValue } from '../../types/registry-contract';
import type { Trace } from '../../types/trace';

const NO_SOURCE_PICKER = new Set(['line-crossings', 'reciprocity-isolation', 'stability', 'ip3']);
const SEGMENT_LABELS: Record<string, string> = { visible: 'Visible', all: 'All', add: '+', subtract: '−', multiply: '×', divide: '÷', gaussian: 'Gaussian', flattop: 'Flat top', fivepole: 'Five-pole' };
const LABELS: Record<string, string> = {
  'moving-average': 'Moving average', 'median-filter': 'Median filter', 'savitzky-golay': 'Savitzky–Golay', none: 'None',
};

const labelOf = (value: string): string => SEGMENT_LABELS[value] ?? LABELS[value] ?? value;
const traceLabel = (trace: Trace): string => trace.dn || trace.name;

interface SelectState { anchor: HTMLElement; title: string; options: { value: string; label: string }[]; value: string; onPick: (value: string) => void }

export function AnalysisInstanceCard({ instance }: { instance: AnalysisInstance }) {
  const ctx = useAnalysisContext();
  const analysisDispatch = useAnalysisDispatch();
  const analysisCount = useAnalysisState().analyses.length;
  const uiDispatch = useUiDispatch();
  const aggregate = useOptionalAggregateWorkspace();
  const { derivedTraces } = useTraceState();
  const [select, setSelect] = useState<SelectState | null>(null);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [invalidKey, setInvalidKey] = useState<string | null>(null);
  const [currentRow, setCurrentRow] = useState<string | null>(null);

  const tool = getAnalysisTool(instance.toolId) as unknown as AnalysisTool<ParameterSchema> | undefined;
  const source = instance.source.traceId ? ctx.traceById.get(instance.source.traceId) : undefined;
  const second = instance.source.secondTraceId ? ctx.traceById.get(instance.source.secondTraceId) : undefined;
  const line = instance.source.lineId != null ? ctx.refLines.find(item => item.id === instance.source.lineId) : undefined;
  const result = useMemo(() => computeInstance(instance, ctx.inputs), [instance, ctx.inputs]);
  const units: CardUnits = { x: source?.units.x ?? ctx.targetTrace?.units.x ?? 'Hz', y: source?.units.y ?? ctx.targetTrace?.units.y };
  const paneTitle = (paneId: string): string => { const index = ctx.panes.findIndex(pane => pane.id === paneId); return ctx.panes[index]?.title || `Pane ${index + 1}`; };
  const paneBadge = (paneId: string): string => `P${ctx.panes.findIndex(pane => pane.id === paneId) + 1}`;
  const hueOf = (traceName: string): number => oklchHue(ctx.traceColors[traceName] ?? '') ?? 270;

  if (!tool) return null;
  const isLine = instance.toolId === 'line-crossings';
  const title = isLine ? `${line?.label ?? (line?.type === 'h' ? 'H' : 'V')} crossings` : instance.toolId === 'crossings' ? 'Threshold crossings' : tool.meta.title;
  const lineValue = line ? formatCrossingValue(line.value, line.type === 'v' ? units.x : units.y, significantStep(line.value, 6)) : '';
  const firstPane = source ? ctx.tracePaneMap[source.name]?.[0] : undefined;
  const sourceText = isLine
    ? `${line?.label ?? ''} · ${lineValue}`
    : source ? [traceLabel(source), source.file, firstPane ? paneTitle(firstPane) : null].filter(Boolean).join(' · ') : ctx.target.trace && NO_SOURCE_PICKER.has(instance.toolId) ? [ctx.target.traceLabel, ctx.target.trace.file].filter(Boolean).join(' · ') : 'No trace selected';

  const traceOptions = ctx.visibleTraces.map(trace => ({ value: trace.id, label: traceLabel(trace) }));
  const openSelect = (anchor: HTMLElement, label: string, options: SelectState['options'], value: string, onPick: (value: string) => void) => setSelect({ anchor, title: label, options, value, onPick });
  const setSource = (patch: Partial<AnalysisInstance['source']>) => analysisDispatch({ type: 'SET_ANALYSIS_SOURCE', payload: { id: instance.id, source: { ...instance.source, ...patch } } });
  const setParam = (key: string, value: ParameterValue) => analysisDispatch({ type: 'SET_ANALYSIS_PARAMS', payload: { id: instance.id, params: { ...instance.params, [key]: value } } });

  const unitFor = (key: string): string | undefined => {
    if (key === 'level' || key === 'offset') return units.y ?? undefined;
    return tool.parameterUnits?.[key];
  };
  const commitNumber = (key: string, field: ParameterField & { kind: 'number' }, text: string) => {
    const unit = unitFor(key);
    const parsed = unit ? parseEngInput(text, { baseUnit: unit }) : null;
    const value = parsed?.ok ? parsed.value : Number(text.trim().replace('−', '-'));
    const inRange = Number.isFinite(value) && (field.min === undefined || value >= field.min) && (field.max === undefined || value <= field.max);
    if (!inRange) { setInvalidKey(key); return; }
    setInvalidKey(null);
    if (value !== instance.params[key]) setParam(key, value);
  };

  const fields: ParamField[] = [];
  if (!NO_SOURCE_PICKER.has(instance.toolId)) {
    fields.push({ id: 'source', label: instance.toolId === 'trace-math' ? 'Trace A' : 'Trace', control: { type: 'select', value: source ? traceLabel(source) : 'Pick a trace', onOpen: anchor => openSelect(anchor, 'Trace', traceOptions, source?.id ?? '', value => setSource({ traceId: value })) } });
  }
  if (instance.toolId === 'trace-math') {
    fields.push({ id: 'second', label: 'Trace B', control: { type: 'select', value: second ? traceLabel(second) : 'Pick a trace', onOpen: anchor => openSelect(anchor, 'Trace B', traceOptions, second?.id ?? '', value => setSource({ secondTraceId: value })) } });
  }
  for (const [key, field] of Object.entries(tool.params)) {
    if (instance.toolId === 'smooth' && ((key === 'window' && instance.params['method'] === 'none') || (key === 'sgOrder' && instance.params['method'] !== 'savitzky-golay'))) continue;
    const current = instance.params[key];
    if (field.kind === 'number') {
      const unit = unitFor(key);
      fields.push({ id: key, label: field.title, control: { type: 'number', value: String(current ?? field.defaultValue), ...(unit ? { unit } : {}), invalid: invalidKey === key, onCommit: text => commitNumber(key, field, text) } });
    } else if (field.kind === 'choice') {
      const value = String(current ?? field.defaultValue);
      if (field.options.length <= 4 && field.options.every(option => labelOf(option).length <= 9)) {
        fields.push({ id: key, label: field.title, control: { type: 'segmented', value, options: field.options.map(option => ({ value: option, label: labelOf(option) })), onChange: next => setParam(key, next) } });
      } else {
        fields.push({ id: key, label: field.title, control: { type: 'select', value: labelOf(value), onOpen: anchor => openSelect(anchor, field.title, field.options.map(option => ({ value: option, label: labelOf(option) })), value, next => setParam(key, next)) } });
      }
    }
  }

  const outputs = result.outputs ?? [];
  const numbers = !isLine && instance.toolId !== 'crossings' && tool.kind === 'measure' ? describeNumbers(instance.toolId, outputs, units) : null;
  const tableOutput = outputs.find(output => output.type === 'table');
  let crossings: ReturnType<typeof describeCrossings> | null = null;
  let valueLabel = 'X';
  if (tableOutput && tableOutput.type === 'table') {
    if (isLine && line) {
      valueLabel = line.type === 'v' ? 'Y' : 'X';
      crossings = describeCrossings(tableOutput.rows.map(row => ({ paneId: String(row[0]), traceName: String(row[1]), value: Number(row[2]) })), ctx.panes.map(pane => pane.id), units, line.type === 'v' ? 'y' : 'x');
    } else if (instance.toolId === 'crossings') {
      crossings = describeCrossings(tableOutput.rows.map(row => ({ paneId: firstPane ?? ctx.activePaneId ?? 'pane-1', traceName: source?.name ?? '', value: Number(row[0]) })), ctx.panes.map(pane => pane.id), units, 'x');
    }
  }
  const shortName = (name: string): string => { const trace = ctx.allKnownTraces.find(item => item.name === name); return trace ? traceLabel(trace) : name; };
  const crossingGroups = crossings?.groups.map(group => ({
    paneBadge: paneBadge(group.paneId), paneTitle: paneTitle(group.paneId),
    rows: group.rows.map(row => ({ id: row.id, hue: hueOf(row.traceName), trace: shortName(row.traceName), value: row.value, current: row.id === currentRow })),
  }));
  const output = instance.outputTraceId ? derivedTraces.find(trace => trace.id === instance.outputTraceId) : undefined;
  const summary = numbers?.summary ?? (crossings ? `${crossings.total} crossing${crossings.total === 1 ? '' : 's'}` : output ? `→ ${traceLabel(output)}` : undefined);

  const copy = (text: string) => { void navigator.clipboard?.writeText(text).catch(() => undefined); };
  const remove = () => {
    const action = { type: 'REMOVE_ANALYSIS' as const, payload: { id: instance.id } };
    if (aggregate) aggregate.historyDispatch({ type: 'change', toastMessage: `Removed ${title}`, toastKind: 'delete', command: { slice: 'analysis', action } });
    else analysisDispatch(action);
    if (analysisCount <= 1) uiDispatch({ type: 'SET', payload: { key: 'showRightPanel', value: false } });
  };
  const pickTrace = (anchor: HTMLElement) => openSelect(anchor, 'Trace', traceOptions, source?.id ?? '', value => setSource({ traceId: value }));

  return (
    <>
      <AnalysisCard id={instance.id} kind={tool.kind === 'math' ? 'math' : 'measure'} title={title} source={sourceText} collapsed={instance.collapsed}
        {...(summary ? { summary } : {})} menuOpen={menu !== null}
        onToggle={() => analysisDispatch({ type: 'SET_ANALYSIS_COLLAPSED', payload: { id: instance.id, collapsed: !instance.collapsed } })}
        onMenu={anchor => setMenu(anchor)} onRemove={remove}>
        {fields.length > 0 && !isLine ? <Params fields={fields} /> : null}
        {result.reason
          ? <CardMsg tone="warning" text={result.reason} {...(!NO_SOURCE_PICKER.has(instance.toolId) && !source ? { action: { label: 'Pick a trace', onClick: () => { const button = document.querySelector<HTMLElement>(`[data-testid="analysis-card-${instance.id}"] .an-select`); if (button) pickTrace(button); } } } : {})} />
          : null}
        {!result.reason && numbers?.result ? <Result {...numbers.result} /> : null}
        {!result.reason && numbers && numbers.rows.length > 0 ? <KeyValues rows={numbers.rows} /> : null}
        {!result.reason && crossingGroups ? (
          <CrossingsList groups={crossingGroups} valueLabel={valueLabel} {...(crossings?.capNote ? { capNote: crossings.capNote } : {})}
            onSelect={setCurrentRow}
            onCopy={() => copy(crossingsCsv(crossings?.groups ?? [], paneBadge, valueLabel))} />
        ) : null}
        {!result.reason && tool.kind === 'math' ? (
          output
            ? <OutputRow hue={hueOf(output.name)} name={traceLabel(output)} panes={(ctx.tracePaneMap[output.name] ?? []).map(paneBadge)} live={instance.live}
                onLive={live => analysisDispatch({ type: 'SET_ANALYSIS_LIVE', payload: { id: instance.id, live } })} />
            : <Busy text="Output trace removed; the card no longer follows it." />
        ) : null}
      </AnalysisCard>
      {select ? (
        <PopoverAt label={select.title} at={select.anchor} onClose={() => setSelect(null)}>
          <KitMenu label={select.title} title={select.title} checklist style={{ width: 220 }}
            entries={select.options.length ? select.options.map(option => ({ id: option.value, label: option.label, checked: option.value === select.value, onSelect: () => { select.onPick(option.value); setSelect(null); } })) : [{ label: 'No visible traces', disabledReason: 'Load or show a trace first' }]} />
        </PopoverAt>
      ) : null}
      {menu ? (
        <PopoverAt label={`${title} actions`} at={menu} onClose={() => setMenu(null)}>
          <KitMenu label={`${title} actions`} entries={[
            { label: 'Copy results', onSelect: () => { setMenu(null); copy(crossings ? crossingsCsv(crossings.groups, paneBadge, valueLabel) : resultsText(title, numbers)); } },
            'separator',
            { label: 'Remove', danger: true, onSelect: () => { setMenu(null); remove(); } },
          ]} />
        </PopoverAt>
      ) : null}
    </>
  );
}
