// One analysis instance rendered with the Analysis kit (AC-3): generic over the registry tool.
// The tool's params become the generated form, its outputs become key/value rows, a headline result,
// crossings, or a created trace row. All formatting comes from domain/analysis/card-view.ts.
import { useContext, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import './kit/analysis.css';
import './peak-rows.css';
import { AnalysisCard, CardMsg, CreateRow, CrossingsList, KeyValues, Params, Result, Results } from './kit/Analysis';
import type { ParamField } from './kit/types';
import { Menu as KitMenu } from '../left-panel/Menu';
import { PopoverAt } from '../shared/Controls';
import { useAnalysisContext } from '../../hooks/use-analysis-context';
import { autoPickIp3 } from '../../domain/analysis/ip3-auto';
import { useAnalysisDispatch, useAnalysisState } from '../../stores/analysis-store';
import { useOptionalAggregateWorkspace } from '../../stores/aggregate-workspace-store';
import { useTraceDispatch, useTraceState } from '../../stores/trace-store';
import { useUiDispatch } from '../../stores/ui-store';
import { useMarkerDispatch } from '../../stores/marker-store';
import { PaneLimitContext } from '../../stores/pane-store';
import { getAnalysisTool } from '../../domain/analysis/tool-registry';
import { autoOutputName, computeInstance } from '../../domain/analysis/instances';
import { describeStimulus } from '../../domain/analysis/trace-math-align';
import { UNEVEN_SAMPLES } from '../../domain/analysis/fft';
import type { InstanceResult } from '../../domain/analysis/instances';
import { crossingsCsv, describeInstance, resultsText, traceMathAdvice } from '../../domain/analysis/card-view';
import type { CardUnits } from '../../domain/analysis/card-view';
import { formatCrossingValue, significantStep } from '../../domain/analysis/crossing-rows';
import { oklchHue } from '../../domain/color-hue';
import { parseEngInput } from '../../domain/units';
import { paneName } from '../../domain/line-view';
import type { AnalysisInstance } from '../../types/analysis-instance';
import type { AnalysisTool, ParameterField, ParameterSchema, ParameterValue } from '../../types/registry-contract';
import type { Trace } from '../../types/trace';
import type { TraceMathOp } from '../../domain/trace-math-units';

const NO_SOURCE_PICKER = new Set(['line-crossings', 'reciprocity-isolation', 'stability', 'ip3']);
const SEGMENT_LABELS: Record<string, string> = { visible: 'Visible', all: 'All', add: '+', subtract: '−', multiply: '×', divide: '÷', gaussian: 'Gaussian', flattop: 'Flat top', fivepole: 'Five-pole', dbv: 'dBV', v: 'V', dbm: 'dBm 50 Ω', auto: 'Auto' };
const LABELS: Record<string, string> = {
  'moving-average': 'Moving average', 'median-filter': 'Median filter', 'savitzky-golay': 'Savitzky–Golay', none: 'None',
  hann: 'Hann', rectangular: 'Rectangular', hamming: 'Hamming', blackman: 'Blackman', 'blackman-harris': 'Blackman-Harris',
  nuttall: 'Nuttall', 'blackman-nuttall': 'Blackman-Nuttall', kaiser: 'Kaiser', tukey: 'Tukey', chebyshev: 'Dolph-Chebyshev',
  dbmv: 'dBmV', dbuv: 'dBµV', dbvhz: 'dBV/Hz', vrthz: 'V/√Hz', dbmhz: 'dBm/Hz',
  off: 'Off', dc: 'DC', avg4: '4', avg16: '16', avg64: '64', max: 'Max hold',
  h5: 'H2–H5', h10: 'H2–H10', near: 'Near',
};

const labelOf = (value: string): string => ({ a: "A's", b: "B's", both: 'Both', linear: 'Linear', cubic: 'Cubic', nearest: 'Nearest', previous: 'Previous', next: 'Next', sinc: 'Sinc', '': 'Choose…' } as Record<string, string>)[value] ?? SEGMENT_LABELS[value] ?? LABELS[value] ?? value;
const traceLabel = (trace: Trace): string => trace.dn || trace.name;

interface SelectState { anchor: HTMLElement; title: string; options: { value: string; label: string }[]; value: string; onPick: (value: string) => void }

export function AnalysisInstanceCard({ instance }: { instance: AnalysisInstance }) {
  const ctx = useAnalysisContext();
  const analysisDispatch = useAnalysisDispatch();
  const { analyses, highlightedPeak } = useAnalysisState();
  const analysisCount = analyses.length;
  const markerDispatch = useMarkerDispatch();
  const uiDispatch = useUiDispatch();
  const aggregate = useOptionalAggregateWorkspace();
  const { derivedTraces } = useTraceState();
  const traceDispatch = useTraceDispatch();
  const [editingOutput, setEditingOutput] = useState(false);
  const [select, setSelect] = useState<SelectState | null>(null);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [ip3Note, setIp3Note] = useState<string | null>(null);
  const [invalidKey, setInvalidKey] = useState<string | null>(null);
  const [currentRow, setCurrentRow] = useState<string | null>(null);
  const paneLimit = useContext(PaneLimitContext)?.limit ?? 4;

  const tool = getAnalysisTool(instance.toolId) as unknown as AnalysisTool<ParameterSchema> | undefined;
  const source = instance.source.traceId ? ctx.traceById.get(instance.source.traceId) : undefined;
  const second = instance.source.secondTraceId ? ctx.traceById.get(instance.source.secondTraceId) : undefined;
  const line = instance.source.lineId != null ? ctx.refLines.find(item => item.id === instance.source.lineId) : undefined;
  // A Math tool that also reads values (FFT) keeps computing after it has made its trace.
  const hasNumbers = tool?.outputs.some(item => item.type === 'numbers') ?? false;
  const result = useMemo<InstanceResult>(() => tool?.kind === 'measure' || (tool?.kind === 'math' && (!instance.outputTraceId || hasNumbers)) ? computeInstance(instance, ctx.inputs) : { outputs: [] }, [instance, ctx.inputs, tool, hasNumbers]);
  const units: CardUnits = { x: source?.units.x ?? ctx.targetTrace?.units.x ?? 'Hz', y: source?.units.y ?? ctx.targetTrace?.units.y };
  const paneTitle = (paneId: string): string => paneName(ctx.panes, paneId);
  const paneBadge = (paneId: string): string => `P${ctx.panes.findIndex(pane => pane.id === paneId) + 1}`;
  const hueOf = (traceName: string): number => {
    const trace = ctx.allKnownTraces.find(item => item.name === traceName);
    return trace ? oklchHue(ctx.resolveTraceColor(trace)) ?? 270 : 270;
  };

  if (!tool) return null;
  const isLine = instance.toolId === 'line-crossings';
  const hasOverlay = tool.outputs.some(item => item.type === 'overlay' || item.type === 'shapes');
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
  const stimulus = instance.toolId === 'trace-math' && source && second ? describeStimulus(source, second) : null;
  if (!NO_SOURCE_PICKER.has(instance.toolId)) {
    fields.push({ id: 'source', label: instance.toolId === 'trace-math' ? 'Trace A' : 'Trace', control: { type: 'select', value: source ? traceLabel(source) : 'Pick a trace', ...(source ? { hue: hueOf(source.name) } : {}), onOpen: anchor => openSelect(anchor, 'Trace', traceOptions, source?.id ?? '', value => setSource({ traceId: value })) } });
  }
  if (instance.toolId === 'trace-math') {
    fields.push({ id: 'second', label: 'Trace B', control: { type: 'select', value: second ? traceLabel(second) : 'Pick a trace', ...(second ? { hue: hueOf(second.name) } : {}), onOpen: anchor => openSelect(anchor, 'Trace B', traceOptions, second?.id ?? '', value => setSource({ secondTraceId: value })) } });
  }
  for (const [key, field] of Object.entries(tool.params)) {
    // A setting of one choice only (Kaiser β, Impedance for dBm …) shows while that choice is picked.
    if (field.shownWhen) {
      const owner = tool.params[field.shownWhen.key];
      const current = String(instance.params[field.shownWhen.key] ?? owner?.defaultValue ?? '');
      if (!field.shownWhen.values.includes(current)) continue;
    }
    if (instance.toolId === 'trace-math' && (key === 'points' || key === 'fill')) {
      if (!stimulus || stimulus.identical || stimulus.domainMismatch || !stimulus.overlap || field.kind !== 'choice') continue;
      const value = String(instance.params[key] ?? '');
      fields.push({ id: key, label: field.title, control: { type: 'select', value: labelOf(value), onOpen: anchor => openSelect(anchor, field.title, field.options.filter(option => option !== '').map(option => ({ value: option, label: labelOf(option) })), value, next => setParam(key, next)) } });
      continue;
    }
    if (instance.toolId === 'smooth' && ((key === 'window' && instance.params['method'] === 'none') || (key === 'sgOrder' && instance.params['method'] !== 'savitzky-golay'))) continue;
    const current = instance.params[key];
    if (field.kind === 'number') {
      const unit = unitFor(key);
      fields.push({ id: key, label: field.title, control: { type: 'number', value: String(current ?? field.defaultValue), ...(unit ? { unit } : {}), invalid: invalidKey === key, onCommit: text => commitNumber(key, field, text) } });
    } else if (field.kind === 'choice') {
      const value = String(current ?? field.defaultValue);
      const pointsUsed = key === 'points' ? result.outputs?.find(item => item.type === 'numbers') : undefined;
      if (pointsUsed?.type === 'numbers' && value === 'auto' && Number.isFinite(pointsUsed.values['points'])) {
        fields.push({ id: key, label: field.title, control: { type: 'select', value: `Auto · ${pointsUsed.values['points']}`, title: 'Largest power of two that fits the samples in range', onOpen: anchor => openSelect(anchor, field.title, field.options.map(option => ({ value: option, label: labelOf(option) })), value, next => setParam(key, next)) } });
        continue;
      }
      if (field.options.length <= 4 && field.options.every(option => labelOf(option).length <= 9)) {
        fields.push({ id: key, label: field.title, control: { type: 'segmented', value, options: field.options.map(option => ({ value: option, label: labelOf(option) })), onChange: next => setParam(key, next) } });
      } else {
        fields.push({ id: key, label: field.title, control: { type: 'select', value: labelOf(value), onOpen: anchor => openSelect(anchor, field.title, field.options.map(option => ({ value: option, label: labelOf(option) })), value, next => setParam(key, next)) } });
      }
    }
  }

  const view = tool.kind === 'measure' || hasNumbers ? describeInstance(instance, result, units, { paneOrder: ctx.panes.map(pane => pane.id), paneId: firstPane ?? ctx.activePaneId ?? 'pane-1', traceName: source?.name ?? '', ...(line ? { lineType: line.type } : {}) }) : null;
  const { numbers = null, crossings = null, valueLabel = 'X' } = view ?? {};
  const shortName = (name: string): string => { const trace = ctx.allKnownTraces.find(item => item.name === name); return trace ? traceLabel(trace) : name; };
  const crossingGroups = crossings?.groups.map(group => ({
    paneBadge: paneBadge(group.paneId), paneTitle: paneTitle(group.paneId),
    rows: group.rows.map(row => ({ id: row.id, hue: hueOf(row.traceName), trace: shortName(row.traceName), value: row.value, current: row.id === currentRow })),
  }));
  const output = instance.outputTraceId ? derivedTraces.find(trace => trace.id === instance.outputTraceId) : undefined;
  const renameOutput = (value: string) => {
    if (!output) return;
    const label = value.trim() || instance.autoName || output.name;
    if (label === output.dn) return;
    const action = { type: 'RENAME_DERIVED' as const, payload: { traceId: output.id, label } };
    if (aggregate) aggregate.historyDispatch({ type: 'change', command: { slice: 'traces', action } }); else traceDispatch(action);
  };
  const disabledReason = instance.toolId === 'trace-math' && (!source || !second) ? 'Pick trace A and trace B.' : result.reason ?? (!source ? 'Pick a trace.' : undefined);
  const mathWarning = instance.toolId === 'trace-math' && source && second ? traceMathAdvice((instance.params['operation'] ?? 'add') as TraceMathOp, source, second) : undefined;
  // FFT names its trace before it exists and makes it in a frequency pane; its refusal reads once, on the Create row.
  const createNote = instance.toolId === 'fft' ? { name: source ? autoOutputName(instance, ctx.allKnownTraces) : 'FFT', note: 'Adds the spectrum in a frequency pane.' } : undefined;
  const summary = numbers?.summary ?? (crossings ? `${crossings.total} crossing${crossings.total === 1 ? '' : 's'}` : output ? `→ ${traceLabel(output)}` : undefined);

  const peakTable = instance.toolId === 'peak-table' ? result.outputs?.find(item => item.type === 'table') : undefined;
  const peakRows = peakTable?.type === 'table' ? peakTable.rows.flatMap(row => typeof row[0] === 'number' && typeof row[1] === 'number' && typeof row[2] === 'number' ? [{ n: row[0], x: row[1], y: row[2] }] : []) : [];
  const hasMarker = (x: number) => !!source && ctx.markers.some(marker => marker.trace === source.name && marker.freq === x);
  const missingPeaks = peakRows.filter(row => !hasMarker(row.x));
  const addMarker = (x: number) => { if (source && !hasMarker(x)) markerDispatch({ type: 'PLACE_MARKER', payload: { trace: source, targetFreq: x } }); };
  const addAllMarkers = () => {
    if (!source || !missingPeaks.length) return;
    const action = { type: 'PLACE_MARKERS' as const, payload: { trace: source, targetFreqs: missingPeaks.map(row => row.x) } };
    if (aggregate) aggregate.historyDispatch({ type: 'change', toastMessage: `Added ${missingPeaks.length} markers`, toastKind: 'apply-all', command: { slice: 'markers', action } });
    else markerDispatch(action);
    setMenu(null);
  };

  // IP3 needs four role markers (F1, F2, IM3L, IM3U). Auto-place finds the two tones and their third-order products
  // on the card's trace and places the four markers in one undo step, replacing earlier role markers.
  const autoPlaceIp3 = () => {
    if (!source) return;
    const pick = autoPickIp3(source.data);
    if (!pick.ok) { setIp3Note(pick.reason); setMenu(null); return; }
    setIp3Note(null); setMenu(null);
    const action = { type: 'SET_ROLE_MARKERS' as const, payload: { trace: source, items: pick.items.map(item => ({ freq: item.freq, label: item.label })) } };
    if (aggregate) aggregate.historyDispatch({ type: 'change', command: { slice: 'markers', action } });
    else markerDispatch(action);
  };

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
      <AnalysisCard id={instance.id} kind={tool.kind === 'math' ? 'math' : 'measure'} title={title} source={sourceText} {...(source ? { sourceHue: hueOf(source.name) } : {})} collapsed={instance.collapsed}
        {...(hasOverlay ? { overlay: { on: instance.overlay !== false, onToggle: () => analysisDispatch({ type: 'SET_ANALYSIS_OVERLAY', payload: { id: instance.id, overlay: instance.overlay === false } }) } } : {})}
        {...(summary ? { summary } : {})} menuOpen={menu !== null}
        onToggle={() => analysisDispatch({ type: 'SET_ANALYSIS_COLLAPSED', payload: { id: instance.id, collapsed: !instance.collapsed } })}
        onMenu={anchor => setMenu(anchor)} onRemove={remove}>
        {fields.length > 0 && !isLine ? <Params cardId={instance.id} fields={fields} /> : null}
        <Results>
        {numbers?.facts ? <div className="an-result__note" data-testid="analysis-facts">{numbers.facts}</div> : null}
        {instance.toolId === 'fft' && result.reason === UNEVEN_SAMPLES && source ? <CardMsg tone="info" text="Resample makes an evenly spaced copy of this trace." action={{ label: 'Add Resample', onClick: () => analysisDispatch({ type: 'ADD_ANALYSIS', payload: { toolId: 'resample', source: { traceId: source.id } } }) }} /> : null}
        {stimulus && !stimulus.identical && !stimulus.domainMismatch && source && second ? <CardMsg tone="warning" text={`Stimulus mismatch. A: ${stimulus.aCount} points, ${formatCrossingValue(stimulus.aRange[0], source.units.x, significantStep(stimulus.aRange[0], 6))} to ${formatCrossingValue(stimulus.aRange[1], source.units.x, significantStep(stimulus.aRange[1], 6))}. B: ${stimulus.bCount} points, ${formatCrossingValue(stimulus.bRange[0], second.units.x, significantStep(stimulus.bRange[0], 6))} to ${formatCrossingValue(stimulus.bRange[1], second.units.x, significantStep(stimulus.bRange[1], 6))}.`} /> : null}
        {mathWarning ? <CardMsg tone="warning" text={mathWarning} /> : null}
        {ip3Note ? <CardMsg tone="warning" text={ip3Note} /> : null}
        {(view?.message ?? result.reason) && !(createNote && !output)
          ? <CardMsg tone="warning" text={view?.message ?? result.reason ?? ''} {...(instance.toolId === 'ip3' && source ? { action: { label: 'Auto-place markers', onClick: autoPlaceIp3 } } : {})} {...(!NO_SOURCE_PICKER.has(instance.toolId) && !source ? { action: { label: 'Pick a trace', onClick: () => { const button = document.querySelector<HTMLElement>(`[data-testid="analysis-card-${instance.id}"] .an-select`); if (button) pickTrace(button); } } } : {})} />
          : null}
        {!result.reason && numbers?.result ? <Result {...numbers.result} /> : null}
        {!result.reason && instance.toolId === 'peak-table' && peakRows.length ? <div className="an-peak-rows">{peakRows.map(row => {
          const selected = highlightedPeak?.analysisId === instance.id && highlightedPeak.n === row.n;
          const exists = hasMarker(row.x);
          return <div key={row.n} className="an-peak-row" data-testid={`peak-row-${row.n}`}>
            <button type="button" className="an-peak-row__select" aria-pressed={selected} onClick={() => analysisDispatch({ type: 'SET_HIGHLIGHTED_PEAK', payload: selected ? null : { analysisId: instance.id, n: row.n } })}>
              <span>#{row.n} · {formatCrossingValue(row.x, units.x, significantStep(row.x, 6))}</span><span>{formatCrossingValue(row.y, units.y, significantStep(row.y, 6))}</span>
            </button>
            <button type="button" className="an-btn" disabled={exists} title={exists ? 'Already a marker here' : 'Add marker'} onClick={() => addMarker(row.x)}>{exists ? '✓' : '+ Marker'}</button>
          </div>;
        })}</div> : !result.reason && numbers && numbers.rows.length > 0 ? <KeyValues rows={numbers.rows} /> : null}
        {!result.reason && crossingGroups ? (
          <CrossingsList groups={crossingGroups} valueLabel={valueLabel} {...(crossings?.capNote ? { capNote: crossings.capNote } : {})}
            onSelect={setCurrentRow}
            onCopy={() => copy(crossingsCsv(crossings?.groups ?? [], paneBadge, valueLabel))} />
        ) : null}
        {tool.kind === 'math' ? (
          output
            ? <div className="an-output" tabIndex={0} onKeyDown={event => { if (event.key === 'F2') { event.preventDefault(); event.stopPropagation(); setEditingOutput(true); } }}>
                <span className="an-output__arrow" aria-hidden="true">→</span><span className="an-output__swatch is-created" style={{ '--h': hueOf(output.name) } as CSSProperties} /><span className="an-output__fx" aria-hidden="true">ƒ</span>
                {editingOutput ? <input className="an-output__name" aria-label="Trace name" data-testid="trace-name-input" defaultValue={traceLabel(output)} ref={el => { if (el && document.activeElement !== el) { el.focus(); el.select(); } }} onBlur={event => { renameOutput(event.currentTarget.value); setEditingOutput(false); }} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { event.preventDefault(); setEditingOutput(false); } }} /> : <span className="an-output__name" onDoubleClick={() => setEditingOutput(true)}>{traceLabel(output)}</span>}
                {(ctx.tracePaneMap[output.name] ?? []).map(paneBadge).map(pane => <span key={pane} className="an-pane-badge">{pane}</span>)}<span className="an-output__note">follows inputs</span>
              </div>
            : <CreateRow {...(disabledReason ? { disabledReason } : {})} {...createNote} onCreate={() => analysisDispatch({ type: 'CREATE_ANALYSIS_OUTPUT', payload: { id: instance.id, paneLimit } })} />
        ) : null}
        </Results>
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
            ...(instance.toolId === 'ip3' ? [{ label: 'Auto-place markers', ...(!source ? { disabledReason: 'Pick a trace first' } : {}), onSelect: autoPlaceIp3 }] : []),
            ...(instance.toolId === 'peak-table' ? [{ label: 'Add all as markers', ...(!missingPeaks.length || !source ? { disabledReason: 'All peaks already have markers' } : {}), onSelect: addAllMarkers }] : []),
            ...(tool.kind === 'math' && output ? [{ label: 'Freeze as a copy', onSelect: () => { setMenu(null); analysisDispatch({ type: 'FREEZE_ANALYSIS_COPY', payload: { id: instance.id } }); } }] : []),
            ...(output && instance.autoName !== undefined && output.dn !== instance.autoName ? [{ label: 'Reset name', onSelect: () => { setMenu(null); renameOutput(''); } }] : []),
            ...(tool.kind === 'measure' || output ? [{ label: 'Copy results', onSelect: () => { setMenu(null); copy(crossings ? crossingsCsv(crossings.groups, paneBadge, valueLabel) : resultsText(title, numbers)); } }, 'separator' as const] : []),
            { label: 'Remove', danger: true, onSelect: () => { setMenu(null); remove(); } },
          ]} />
        </PopoverAt>
      ) : null}
    </>
  );
}
