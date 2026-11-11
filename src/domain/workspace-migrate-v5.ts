import { buildScalarDisplayTraceFromSeriesDataset, buildSeriesDatasetFromTrace } from './dataset-builders';
import { adaptDisplayTraceToLegacyTrace } from './display-trace-adapter';
import { migrateWorkspaceSnapshot } from './workspace-migrate-v4';
import { defaultPaneSettings } from '../types/pane';
import type { WorkspacePaneV5, WorkspaceSnapshotV5 } from '../types/workspace-v5';
import type { RefLine } from '../types/ref-line';
import type { AnalysisInstance } from '../types/analysis-instance';
import type { ParameterSchema } from '../types/registry-contract';
import { ANALYSIS_TOOLS, getAnalysisTool } from './analysis/tool-registry';
import { createInstance } from './analysis/instances';
import { validateParameters } from './analysis/tool-contract';
import { SOURCE_HUES, CREATED_HUES } from './trace-palette';
import type { TraceColorAssignment } from './trace-palette';

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const version = (value: unknown): boolean => value === undefined || (Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5);

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const stringMap = (v: unknown): boolean => object(v) && Object.values(v).every(x => typeof x === 'string');
const boolMap = (v: unknown): boolean => object(v) && Object.values(v).every(x => typeof x === 'boolean');
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
function hueSlots(value: unknown): Record<string, TraceColorAssignment> | undefined | null {
  if (value === undefined) return undefined;
  if (!object(value)) return null;
  const values = Object.values(value);
  if (values.length && values.every(item => typeof item === 'number' && Number.isFinite(item))) return undefined;
  if (!values.every(item => object(item) && (item.palette === 'source' || item.palette === 'created') && Number.isInteger(item.index) && Number(item.index) >= 0 && Number(item.index) < 8 && Number.isSafeInteger(item.round) && Number(item.round) >= 0 && item.hue === (item.palette === 'source' ? SOURCE_HUES : CREATED_HUES)[Number(item.index)] && (item.cbIndex === undefined || (item.palette === 'created' && Number.isInteger(item.cbIndex) && Number(item.cbIndex) >= 0 && Number(item.cbIndex) < 8)) && Object.keys(item).every(key => ['palette', 'index', 'round', 'hue', 'cbIndex'].includes(key)))) return null;
  return value as Record<string, TraceColorAssignment>;
}

/** Reject invalid analysis references just as invalid pane memberships are rejected. */
function validAnalyses(value: unknown, derived: readonly unknown[]): value is AnalysisInstance[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  const outputs = new Set<string>();
  for (const item of value) {
    if (!object(item) || typeof item.id !== 'string' || !/^analysis-[1-9]\d*$/.test(item.id) || !Number.isSafeInteger(Number(item.id.slice(9))) || Number(item.id.slice(9)) >= Number.MAX_SAFE_INTEGER || ids.has(item.id) || typeof item.toolId !== 'string' || !object(item.source) || !object(item.params) || typeof item.collapsed !== 'boolean' || (item.autoName !== undefined && typeof item.autoName !== 'string')) return false;
    if ((item.overlay !== undefined && typeof item.overlay !== 'boolean') || !(item.source.traceId === null || typeof item.source.traceId === 'string') || !(item.source.secondTraceId === undefined || item.source.secondTraceId === null || typeof item.source.secondTraceId === 'string') || !(item.source.lineId === undefined || item.source.lineId === null || finite(item.source.lineId))) return false;
    const tool = getAnalysisTool(item.toolId);
    if (!tool || !validateParameters(tool.params as ParameterSchema, item.params).valid) return false;
    if (tool.kind === 'math') {
      if (item.outputTraceId !== null) {
        if (typeof item.outputTraceId !== 'string' || outputs.has(item.outputTraceId) || !derived.some(trace => object(trace) && trace.kind === 'derived' && trace.id === item.outputTraceId && trace.analysisId === item.id)) return false;
        outputs.add(item.outputTraceId);
      }
    } else if (item.outputTraceId !== null) return false;
    ids.add(item.id);
  }
  return true;
}

function withoutLegacyLive(analyses: readonly AnalysisInstance[], derived: WorkspaceSnapshotV5['derivedTraces']): AnalysisInstance[] {
  return analyses.map(item => {
    const { live: _live, ...rest } = item as AnalysisInstance & { live?: unknown };
    const output = _live !== undefined && rest.autoName === undefined ? derived.find(trace => trace.id === rest.outputTraceId) : undefined;
    return output ? { ...rest, autoName: output.dn } : rest;
  });
}

const legacyToolIds: Readonly<Record<string, string>> = {
  'peak-spur-table': 'peak-table', 'bandwidth-helper': 'bandwidth', 'threshold-crossings': 'crossings',
  'touchstone-stability': 'stability', 'ripple-flatness': 'ripple',
};
const matrixViews = new Set(['vswr', 'return-loss', 'group-delay']);

function legacyAnalyses(snapshot: WorkspaceSnapshotV5): { analyses: AnalysisInstance[]; droppedViews: number } {
  const selected = snapshot.selectedTraceName;
  const display = snapshot.files.flatMap(file => file.displayTraces ?? []).find(item => (item.compat?.legacyTraceName ?? item.id) === selected);
  const trace = [...snapshot.files.flatMap(file => file.traces), ...snapshot.derivedTraces].find(item => item.name === selected);
  const traceId = display?.id ?? trace?.id ?? null;
  const open = Object.entries(snapshot.analysisOpenState).filter(([, enabled]) => enabled);
  const droppedViews = open.filter(([id]) => matrixViews.has(id)).length;
  const order = new Map(ANALYSIS_TOOLS.map((tool, index) => [tool.meta.id, index]));
  const tools = open.map(([id]) => ({ id, toolId: legacyToolIds[id] ?? id })).filter(item => !matrixViews.has(item.id) && order.has(item.toolId))
    .sort((a, b) => (order.get(a.toolId) ?? 0) - (order.get(b.toolId) ?? 0));
  const analyses: AnalysisInstance[] = [];
  for (const item of tools) {
    const instance = createInstance(`analysis-${analyses.length + 1}`, item.toolId, { traceId });
    if (instance) analyses.push(instance);
  }
  const saved = [...snapshot.savedNoise.filter(row => object(row) && finite(row.id)).map(row => ({ row, toolId: 'noise-psd' })), ...snapshot.savedIP3.filter(row => object(row) && finite(row.id)).map(row => ({ row, toolId: 'ip3' }))].sort((a, b) => a.row.id - b.row.id);
  for (const { row, toolId } of saved) {
    const parameters = object(row.parameters) ? row.parameters : {};
    // Legacy saved rows contain result metadata and marker-role maps, which are not tool parameters.
    const params = toolId === 'noise-psd' ? { filter: parameters.filter } : { gain: parameters.gain };
    const tool = getAnalysisTool(toolId);
    const usable = tool && validateParameters(tool.params as ParameterSchema, params).valid ? params : {};
    const sourceId = typeof row.sourceTraceId === 'string' ? row.sourceTraceId : typeof row.sourceTraceId === 'number' ? String(row.sourceTraceId) : null;
    const instance = createInstance(`analysis-${analyses.length + 1}`, toolId, { traceId: sourceId }, usable as Record<string, string | number>);
    if (instance) analyses.push({ ...instance, collapsed: true });
  }
  return { analyses, droppedViews };
}

/** Legacy null meant global; horizontal lines retain the first pane because Y is local. */
export function migrateLines(raw: unknown, paneOrder: readonly string[]): RefLine[] | null {
  if (!Array.isArray(raw)) return null;
  const paneSet = new Set(paneOrder);
  const ids = new Set<number>();
  const groups = new Map<string, Record<string, unknown>[]>();
  const items: { first: Record<string, unknown>; members: Record<string, unknown>[] }[] = [];
  for (const value of raw) {
    if (!object(value) || !finite(value.id) || ids.has(value.id) || !['h', 'v'].includes(String(value.type)) || !finite(value.value) || !nullableString(value.label) || !(value.axisUnit === undefined || nullableString(value.axisUnit)) || !(value.deltaPartnerId === undefined || value.deltaPartnerId === null || finite(value.deltaPartnerId))) return null;
    ids.add(value.id);
    if ('paneIds' in value) {
      if (!strings(value.paneIds) || new Set(value.paneIds).size !== value.paneIds.length || value.paneIds.some(id => !paneSet.has(id)) || (value.type === 'h' && value.paneIds.length > 1)) return null;
      items.push({ first: value, members: [value] });
    } else {
      if (!optionalBoolean(value.paneless) || (value.paneless === true && value.paneId !== null) || !(value.paneId === null || (typeof value.paneId === 'string' && paneSet.has(value.paneId))) || !(value.groupId === null || typeof value.groupId === 'string') || (value.type === 'h' && value.groupId !== null)) return null;
      const key = typeof value.groupId === 'string' ? value.groupId : null;
      const members = key === null ? undefined : groups.get(key);
      if (members) { members.push(value); continue; }
      const next = [value];
      if (key !== null) groups.set(key, next);
      items.push({ first: value, members: next });
    }
  }
  const remap = new Map<number, number>();
  for (const { members } of items) {
    const survivor = Math.min(...members.map(member => Number(member.id)));
    for (const member of members) remap.set(Number(member.id), survivor);
  }
  return items.map(({ first, members }) => {
    const membership = new Set<string>();
    for (const member of members) {
      if (strings(member.paneIds)) member.paneIds.forEach(id => membership.add(id));
      else if (!member.paneless && member.paneId === null) (member.type === 'h' ? paneOrder.slice(0, 1) : paneOrder).forEach(id => membership.add(id));
      else if (!member.paneless && typeof member.paneId === 'string') membership.add(member.paneId);
    }
    const axisUnit = members.find(member => member.axisUnit !== undefined)?.axisUnit;
    const survivorId = remap.get(Number(first.id)) ?? Number(first.id);
    const partnerSource = members.map(member => member.deltaPartnerId).find(value => value !== undefined);
    const remappedPartner = typeof partnerSource === 'number' ? remap.get(partnerSource) ?? partnerSource : partnerSource;
    // A delta partner that points into the merged group would become a self-reference: drop it.
    const partner = remappedPartner === survivorId ? undefined : remappedPartner;
    return { id: remap.get(Number(first.id)) ?? Number(first.id), type: first.type as 'h' | 'v', value: Number(first.value), label: first.label as string | null,
      paneIds: strings(first.paneIds) ? [...first.paneIds] : paneOrder.filter(id => membership.has(id)), ...(axisUnit !== undefined ? { axisUnit: axisUnit as string | null } : {}), ...(partner !== undefined ? { deltaPartnerId: partner as number | null } : {}) };
  });
}

function selectedLineId(ui: unknown, raw: unknown, lines: readonly RefLine[]): number | null | undefined {
  if (!object(ui) || ui.selectedRefLineId === undefined) return undefined;
  if (ui.selectedRefLineId === null) return null;
  if (!finite(ui.selectedRefLineId) || !Array.isArray(raw)) return null;
  const selected = raw.find(item => object(item) && item.id === ui.selectedRefLineId);
  if (!object(selected)) return null;
  if (typeof selected.groupId === 'string') {
    const ids = raw.filter(item => object(item) && item.groupId === selected.groupId && finite(item.id)).map(item => Number(item.id));
    return ids.length ? Math.min(...ids) : null;
  }
  return lines.some(line => line.id === selected.id) ? Number(selected.id) : null;
}

const point = (v: unknown): boolean => object(v) && finite(v.freq) && finite(v.amp);
const numericFields = (v: unknown, keys: string[]): boolean => object(v) && keys.every(key => finite(v[key]));
const matrix = (v: unknown, ports: number): boolean => Array.isArray(v) && v.length === ports && v.every(row => Array.isArray(row) && row.length === ports && row.every(cell => numericFields(cell, ['re','im'])));
const references = (v: unknown, ports: number): boolean => Array.isArray(v) && v.length === ports && v.every(ref => finite(ref) && ref > 0);
const sample = (v: unknown): boolean => numericFields(v, ['x','y']);
const optionalBoolean = (v: unknown): boolean => v === undefined || typeof v === 'boolean';
const interpolation = (v: unknown): boolean => v === undefined || ['auto', 'exact', 'linear', 'nearest', 'previous', 'next', 'cubic', 'snap', 'sinc'].includes(String(v));
const nullableString = (v: unknown): boolean => v === null || typeof v === 'string';
const validNetwork = (v: unknown): boolean => object(v) && ['S','Y','Z','G','H'].includes(String(v.parameterType)) && Number.isInteger(v.portCount) && Number(v.portCount) > 0 && references(v.referenceOhms, Number(v.portCount)) && typeof v.freqUnit === 'string' && ['MA','DB','RI'].includes(String(v.dataFormat)) && strings(v.comments) && Array.isArray(v.samples) && v.samples.every(item => object(item) && finite(item.freq) && matrix(item.sMatrix, Number(v.portCount))) && ['full','upper','lower'].includes(String(v.matrixFormat)) && finite(v.version);
const validDataset = (v: unknown): boolean => {
  if (!object(v) || !optionalBoolean(v.hidden) || !optionalBoolean(v.isUniform) || !(v.fileId === undefined || v.fileId === null || typeof v.fileId === 'string' || finite(v.fileId)) || !(v.fileName === undefined || nullableString(v.fileName)) || typeof v.id !== 'string' || !v.id || typeof v.label !== 'string' || !['source','derived'].includes(String(v.kind)) || !['spectrum','waveform','network','iq','symbol'].includes(String(v.family)) || !object(v.provenance) || !strings(v.provenance.rootDatasetIds) || !Array.isArray(v.provenance.transformSteps) || !v.provenance.transformSteps.every(step => object(step) && typeof step.id === 'string' && ['import','network-conversion','mixed-mode-conversion','renormalization','deembedding','resample','fft','trace-math','other'].includes(String(step.kind)) && typeof step.label === 'string' && object(step.params) && strings(step.inputDatasetIds) && (step.inputDisplayTraceIds === undefined || strings(step.inputDisplayTraceIds))) || !object(v.capabilities) || ['supportsSmithView','supportsPolarView','supportsGroupDelay','supportsStabilityAnalysis','supportsEyeDiagram','supportsConstellation','supportsBERAnalysis','supportsFftView'].some(key => typeof (v.capabilities as Record<string, unknown>)[key] !== 'boolean')) return false;
  if (v.family === 'spectrum' || v.family === 'waveform') return v.xDomain === (v.family === 'spectrum' ? 'frequency' : 'time') && Array.isArray(v.series) && v.series.every(series => object(series) && typeof series.id === 'string' && typeof series.label === 'string' && nullableString(series.xUnit) && nullableString(series.yUnit) && Array.isArray(series.samples) && series.samples.every(sample));
  if (v.family === 'network') return v.xDomain === 'frequency' && ['S','Z','Y','ABCD','H','G','T'].includes(String(v.parameterFamily)) && ['single-ended','mixed-mode'].includes(String(v.basis)) && Number.isInteger(v.portCount) && Number(v.portCount) > 0 && references(v.referenceOhms, Number(v.portCount)) && Array.isArray(v.samples) && v.samples.every(item => object(item) && finite(item.freqHz) && matrix(item.matrix, Number(v.portCount)));
  return true;
};
const validSource = (v: unknown): boolean => {
  if (!object(v)) return false;
  if (v.sourceType === 'series') return ['spectrum','waveform'].includes(String(v.datasetFamily)) && typeof v.seriesId === 'string';
  if (v.sourceType === 'network-parameter') return ['S','Z','Y','ABCD','H','G','T'].includes(String(v.parameterFamily)) && ['single-ended','mixed-mode'].includes(String(v.basis)) && Number.isInteger(v.row) && Number(v.row) >= 0 && Number.isInteger(v.col) && Number(v.col) >= 0 && ['complex','magnitude-db','magnitude-linear','phase','real','imag','vswr','return-loss','group-delay','stability-k','stability-mu1','stability-mu2','stability-muprime'].includes(String(v.component));
  if (v.sourceType === 'iq') return ['iq','constellation','eye'].includes(String(v.component));
  return v.sourceType === 'symbol' && ['constellation','eye'].includes(String(v.component));
};
const validDisplay = (v: unknown): boolean => {
  if (!object(v) || !optionalBoolean(v.hidden) || !optionalBoolean(v.isUniform) || !interpolation(v.interpolation) || typeof v.id !== 'string' || !v.id || !['dataset-projection','derived-trace'].includes(String(v.kind)) || typeof v.datasetId !== 'string' || typeof v.label !== 'string' || !['spectrum','waveform','network','iq','symbol'].includes(String(v.family)) || !object(v.provenance) || typeof v.provenance.parentDatasetId !== 'string' || !strings(v.provenance.parentDisplayTraceIds) || !strings(v.provenance.transformSteps) || !validSource(v.source) || !strings(v.supportedViews) || v.supportedViews.some(x => !['cartesian','smith','polar','eye','constellation'].includes(x)) || !['cartesian','smith','polar','eye','constellation'].includes(String(v.defaultView)) || !Array.isArray(v.points) || !nullableString(v.xUnit) || typeof v.semantics !== 'string') return false;
  return v.valueType === 'scalar' ? ['magnitude','phase','real','imag','group-delay','vswr','return-loss','stability','time-amplitude','power-density','custom'].includes(String(v.semantics)) && nullableString(v.yUnit) && v.points.every(sample) : v.valueType === 'complex' && ['network-parameter','impedance','admittance','transfer','iq','custom'].includes(String(v.semantics)) && nullableString(v.valueUnit) && v.points.every(p => numericFields(p,['x','re','im']));
};
const validControls = (v: unknown): boolean => object(v) && ['S','Y','Z','ABCD'].includes(String(v.activeFamily)) && object(v.activeViewByFamily) && ['S','Y','Z','ABCD'].every(key => (key === 'ABCD' && (v.activeViewByFamily as Record<string, unknown>)[key] === undefined) || ['dB','Mag','Phase','Real','Imag','VSWR','Return loss','Group delay'].includes(String((v.activeViewByFamily as Record<string, unknown>)[key])));
const validWizard = (v: unknown): boolean => object(v) && typeof v.delimiter === 'string' && Number.isInteger(v.skipRows) && Number(v.skipRows) >= 0 && Number.isInteger(v.xCol) && Number(v.xCol) >= 0 && Array.isArray(v.yCols) && v.yCols.every(n => Number.isInteger(n) && n >= 0) && finite(v.xMult) && finite(v.yMult) && ['time','frequency'].includes(String(v.domain)) && finite(v.confidence) && strings(v.headers);
const resultMap = (v: unknown, valid: (entry: unknown) => boolean): boolean => object(v) && Object.values(v).every(valid);

// Compare independently serialized top-level and file-owned records without relying on property order.
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  if (!object(a) || !object(b)) return false;
  const ak = Object.keys(a).filter(k => a[k] !== undefined).sort();
  const bk = Object.keys(b).filter(k => b[k] !== undefined).sort();
  return ak.length === bk.length && ak.every((k, i) => k === bk[i] && sameValue(a[k], b[k]));
}

function validGraph(body: Record<string, unknown>, traceIds: Set<string>, traceNames: Set<string>): boolean {
  const datasets = body.datasets as Record<string, unknown>[];
  const displays = body.displayTraces as Record<string, unknown>[];
  if (!datasets.every(validDataset) || !displays.every(validDisplay)) return false;
  const datasetMap = new Map<string, Record<string, unknown>>();
  const displayMap = new Map<string, Record<string, unknown>>();
  for (const d of datasets) { const id = d.id as string; if (datasetMap.has(id)) return false; datasetMap.set(id, d); }
  for (const d of displays) { const id = d.id as string; if (displayMap.has(id)) return false; displayMap.set(id, d); }
  const ownedDatasets = new Set<string>(); const ownedDisplays = new Set<string>();
  const knownTraces = new Map<string, Record<string, unknown>>();
  for (const file of body.files as Record<string, unknown>[]) {
    for (const t of file.traces as Record<string, unknown>[]) knownTraces.set(t.id as string, t);
    for (const [field, map, seen] of [['datasets', datasetMap, ownedDatasets], ['displayTraces', displayMap, ownedDisplays]] as const) {
      for (const entry of (file[field] ?? []) as Record<string, unknown>[]) {
        const id = entry.id as string; if (seen.has(id) || !sameValue(entry, map.get(id))) return false;
        seen.add(id);
      }
    }
  }
  for (const file of body.files as Record<string, unknown>[]) {
    const localDatasets = new Set(((file.datasets ?? []) as Record<string, unknown>[]).map(d => d.id));
    const localDisplays = new Set(((file.displayTraces ?? []) as Record<string, unknown>[]).map(d => d.id));
    if (((file.datasets ?? []) as Record<string, unknown>[]).some(d => d.fileId !== undefined && d.fileId !== null && String(d.fileId) !== String(file.id))) return false;
    if (((file.displayTraces ?? []) as Record<string, unknown>[]).some(d => !localDatasets.has(d.datasetId))) return false;
    for (const d of datasets) if (d.fileId !== undefined && d.fileId !== null && String(d.fileId) === String(file.id) && !localDatasets.has(d.id)) return false;
    for (const d of displays) if (localDatasets.has(d.datasetId) && !localDisplays.has(d.id)) return false;
  }
  for (const t of body.derivedTraces as Record<string, unknown>[]) knownTraces.set(t.id as string, t);
  for (const d of datasets) {
    const provenance = d.provenance as Record<string, unknown>;
    if ((provenance.rootDatasetIds as string[]).some(id => !datasetMap.has(id))) return false;
    for (const step of provenance.transformSteps as Record<string, unknown>[]) {
      if ((step.inputDatasetIds as string[]).some(id => !datasetMap.has(id)) || (Array.isArray(step.inputDisplayTraceIds) && step.inputDisplayTraceIds.some(id => !displayMap.has(id)))) return false;
    }
    if (Array.isArray(d.series)) {
      const ids = d.series.map(series => (series as Record<string, unknown>).id);
      if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) return false;
    }
  }
  const sourceAliases = new Map<string, string>();
  for (const d of displays) {
    const dataset = datasetMap.get(d.datasetId as string); const source = d.source as Record<string, unknown>; const provenance = d.provenance as Record<string, unknown>;
    if (!dataset || d.family !== dataset.family || provenance.parentDatasetId !== d.datasetId || (provenance.parentDisplayTraceIds as string[]).some(id => !displayMap.has(id))) return false;
    if (source.sourceType === 'series' && (dataset.family !== source.datasetFamily || !Array.isArray(dataset.series) || !dataset.series.some(series => object(series) && series.id === source.seriesId))) return false;
    if (source.sourceType === 'series' && typeof source.seriesId === 'string' && source.seriesId.startsWith('series-')) {
      const alias = source.seriesId.slice('series-'.length);
      if (alias && dataset.id === `${String(dataset.family)}-${alias}`) {
        const previous = sourceAliases.get(alias);
        if (previous && previous !== dataset.id) return false;
        sourceAliases.set(alias, dataset.id as string);
      }
    }
    if (source.sourceType === 'network-parameter' && (dataset.family !== 'network' || source.parameterFamily !== dataset.parameterFamily || source.basis !== dataset.basis || Number(source.row) >= Number(dataset.portCount) || Number(source.col) >= Number(dataset.portCount))) return false;
    if ((source.sourceType === 'iq' || source.sourceType === 'symbol') && source.sourceType !== dataset.family) return false;
    const id = d.id as string; const existing = knownTraces.get(id);
    const compat = object(d.compat) ? d.compat : {};
    if (d.compat !== undefined && (!object(d.compat) || (compat.legacyTraceName !== undefined && typeof compat.legacyTraceName !== 'string') || (compat.legacyDisplayName !== undefined && typeof compat.legacyDisplayName !== 'string') || (compat.automaticDisplayName !== undefined && typeof compat.automaticDisplayName !== 'string'))) return false;
    const name = typeof compat.legacyTraceName === 'string' && compat.legacyTraceName ? compat.legacyTraceName : id;
    if (existing) {
      if (typeof compat.legacyTraceName === 'string' && compat.legacyTraceName !== existing.name) return false;
    } else {
      if (traceIds.has(id)) return false;
      if (traceNames.has(name)) {
        // Older direct tabular imports retain the parser trace alongside its
        // canonical display. Verify the builder's structural IDs and samples,
        // and require both records to belong to the same file.
        const candidates = [...knownTraces.values()].filter(t => t.name === name && t.kind === 'raw');
        if (candidates.length !== 1 || source.sourceType !== 'series') return false;
        const raw = candidates[0]; if (!raw) return false;
        const owner = (body.files as Record<string, unknown>[]).find(file => (file.traces as Record<string, unknown>[]).includes(raw));
        const local = owner && Array.isArray(owner.displayTraces) && owner.displayTraces.some(item => object(item) && item.id === id);
        const series = Array.isArray(dataset.series) ? dataset.series.find(item => object(item) && item.id === source.seriesId) : undefined;
        if (!local || source.seriesId !== `series-${String(raw.id)}` || dataset.id !== `${String(dataset.family)}-${String(raw.id)}` || !object(series) || !Array.isArray(raw.data) || !sameValue(series.samples, raw.data.map(p => object(p) ? { x: p.freq, y: p.amp } : null))) return false;
      }
      traceIds.add(id); traceNames.add(name);
    }
  }
  for (const trace of knownTraces.values()) {
    if (trace.kind !== 'derived' || !(trace.sourceTraceIds as string[]).some(id => !traceIds.has(id) && !sourceAliases.has(id))) continue;
    // A detached or frozen analysis output intentionally retains its last samples after its source disappears.
    if (typeof trace.analysisId !== 'string' && !(object(trace.parameters) && trace.parameters.analysisFrozen === true)) return false;
  }
  return true;
}

function validCurrent(body: Record<string, unknown>): boolean {
  if (!Array.isArray(body.files) || !Array.isArray(body.datasets) || !Array.isArray(body.displayTraces) || !Array.isArray(body.derivedTraces) || !boolMap(body.vis) || !Array.isArray(body.panes) || !object(body.traceAssignments) || !object(body.paneActiveTraceMap) || !object(body.layout) || !object(body.ui) || !Array.isArray(body.markers) || !Array.isArray(body.refLines) || !Array.isArray(body.savedNoise) || !Array.isArray(body.savedIP3) || !boolMap(body.analysisOpenState) || !object(body.xZoomState) || !object(body.yZoomState) || !object(body.analysisResults)) return false;
  if (body.panes.length < 1 || body.panes.length > 8) return false;
  if ((body.analyses !== undefined && !validAnalyses(body.analyses, body.derivedTraces)) || (body.droppedViews !== undefined && (!Number.isSafeInteger(body.droppedViews) || Number(body.droppedViews) < 0))) return false;
  const paneIds = new Set<string>();
  for (const pane of body.panes) {
    if (!object(pane) || typeof pane.id !== 'string' || !pane.id || paneIds.has(pane.id) || typeof pane.title !== 'string' || !['cartesian','smith','smith-inverted','table'].includes(String(pane.renderMode)) || !(pane.xLinkGroup === null || typeof pane.xLinkGroup === 'string') || !object(pane.settings)) return false;
    if (pane.typed !== undefined && typeof pane.typed !== 'boolean') return false;
    if (pane.typed === false && pane.renderMode !== 'cartesian') return false;
    paneIds.add(pane.id);
    const settings = pane.settings;
    for (const key of ['gridMajor','gridMinor','showMarkers','showReferenceLines','showLineLabels','showMarkerLabels','showSampleDots','showReadoutNames','showZeroLine']) if (typeof settings[key] !== 'boolean') return false;
    for (const key of ['gridMajorThickness','gridMinorThickness']) if (!finite(settings[key]) || Number(settings[key]) < 0.5 || Number(settings[key]) > 5) return false;
    for (const key of ['gridMajorOpacity','gridMinorOpacity']) if (!finite(settings[key]) || Number(settings[key]) < 0 || Number(settings[key]) > 1) return false;
    if (typeof settings.gridDashStyle !== 'string' || !object(settings.smith)) return false;
    const smith = settings.smith;
    if (!['z','y','both'].includes(String(smith.grid)) || !['normalised','ohms','off'].includes(String(smith.labels)) || !['chevrons','ends','off'].includes(String(smith.direction)) || !strings(smith.readout) || smith.readout.some(x => !['z','y','gamma','vswr','return-loss'].includes(x)) || new Set(smith.readout).size !== smith.readout.length) return false;
  }
  const layout = body.layout;
  if (!['rows','columns','grid','one-side'].includes(String(layout.preset)) || !strings(layout.paneOrder) || layout.paneOrder.length !== paneIds.size || new Set(layout.paneOrder).size !== paneIds.size || layout.paneOrder.some(id => !paneIds.has(id)) || !object(layout.sizes) || Object.entries(layout.sizes).some(([id,value]) => !paneIds.has(id) || !finite(value) || value <= 0)) return false;
  if (typeof body.activePaneId !== 'string' || !paneIds.has(body.activePaneId) || !stringMap(body.ui.traceColors) || !object(body.ui.traceInterpolations) || Object.values(body.ui.traceInterpolations).some(v => !interpolation(v) || v === undefined)) return false;
  const analysisResults = body.analysisResults;
  if (typeof body.ui.noiseFilter !== 'string' || !(body.ui.noiseSource === null || typeof body.ui.noiseSource === 'string') || typeof body.ui.ip3Gain !== 'string' || ['noiseResults','ip3Results','peakResults','bandwidthResults','rippleResults','rangeStatsResults'].some(key => !object(analysisResults[key]))) return false;
  if (!resultMap(analysisResults.noiseResults, v => Array.isArray(v) && v.every(point)) || !resultMap(analysisResults.peakResults, v => Array.isArray(v) && v.every(row => numericFields(row,['rank','freq','amp']))) || !resultMap(analysisResults.ip3Results, v => v === null || numericFields(v,['f1','f2','p1','p2','pim3l','pim3u','fim3l','fim3u','oip3_l','oip3_u','oip3_avg','deltaL','deltaU'])) || !resultMap(analysisResults.bandwidthResults, v => v === null || (numericFields(v,['refFreq','refAmp','level','left','right','bandwidth']) && object(v) && typeof v.mode === 'string')) || !resultMap(analysisResults.rippleResults, v => v === null || (numericFields(v,['ripple','spanHz']) && object(v) && point(v.min) && point(v.max))) || !resultMap(analysisResults.rangeStatsResults, v => v === null || (numericFields(v,['count','average','spanHz']) && object(v) && point(v.min) && point(v.max) && (v.median === null || finite(v.median))))) return false;
  const zoom = body.xZoomState; const yZoom = body.yZoomState;
  const xWindow = (v: unknown) => numericFields(v,['left','right']);
  if (typeof zoom.zoomAll !== 'boolean' || !(zoom.sharedZoom === null || xWindow(zoom.sharedZoom)) || !object(zoom.paneXZooms) || Object.entries(zoom.paneXZooms).some(([id,v]) => !paneIds.has(id) || !xWindow(v)) || !object(yZoom.paneYZooms) || Object.entries(yZoom.paneYZooms).some(([id,v]) => !paneIds.has(id) || !numericFields(v,['min','max']))) return false;
  const traces: Record<string, unknown>[] = [];
  const fileIds = new Set<string>();
  for (const file of body.files) {
    if (!object(file) || (typeof file.id !== 'string' && !finite(file.id)) || fileIds.has(String(file.id)) || typeof file.fileName !== 'string' || !object(file.meta) || !Array.isArray(file.traces) || (file.rawText !== undefined && typeof file.rawText !== 'string') || (file.error !== undefined && typeof file.error !== 'string') || (file.matrixOpen !== undefined && typeof file.matrixOpen !== 'boolean') || (file.wizardConfig !== undefined && !validWizard(file.wizardConfig)) || (file.columnIdentities !== undefined && (!Array.isArray(file.columnIdentities) || !file.columnIdentities.every(item => object(item) && Number.isInteger(item.index) && Number(item.index) >= 0 && (item.header === undefined || typeof item.header === 'string')) || !Array.isArray(file.displayTraces) || file.columnIdentities.length !== file.displayTraces.length || new Set(file.columnIdentities.map(item => item.index)).size !== file.columnIdentities.length)) || (file.touchstoneControls !== undefined && !validControls(file.touchstoneControls)) || (file.touchstoneNetwork !== undefined && !validNetwork(file.touchstoneNetwork)) || (file.datasets !== undefined && (!Array.isArray(file.datasets) || !file.datasets.every(validDataset))) || (file.displayTraces !== undefined && (!Array.isArray(file.displayTraces) || !file.displayTraces.every(validDisplay)))) return false;
    fileIds.add(String(file.id));
    for (const trace of file.traces) { if (!object(trace)) return false; traces.push(trace); }
  }
  for (const trace of body.derivedTraces) { if (!object(trace)) return false; traces.push(trace); }
  const traceIds = new Set<string>(); const traceNames = new Set<string>();
  for (const trace of traces) {
    if ((trace.automaticDisplayName !== undefined && typeof trace.automaticDisplayName !== 'string') || !optionalBoolean(trace.isUniform) || !interpolation(trace.interpolation) || !['raw','derived'].includes(String(trace.kind)) || !['time','frequency'].includes(String(trace.domain)) || !strings(trace.sourceTraceIds) || !object(trace.units) || !nullableString(trace.units.x) || !nullableString(trace.units.y) || !(trace.parameters === null || object(trace.parameters)) || !(trace.paneId === null || typeof trace.paneId === 'string') || typeof trace.mode !== 'string' || typeof trace.detector !== 'string' || !['spectrum','network','waveform','iq','symbol'].includes(String(trace.family)) || !nullableString(trace.file) || typeof trace.dn !== 'string' || (trace.kind === 'raw' ? trace.operationType !== null : !['add','subtract','multiply','divide','offset','scale','smooth','noise-psd','derived'].includes(String(trace.operationType))) || (trace.touchstoneNetwork !== undefined && !validNetwork(trace.touchstoneNetwork)) || typeof trace.id !== 'string' || !trace.id || traceIds.has(trace.id) || typeof trace.name !== 'string' || !trace.name || traceNames.has(trace.name) || !Array.isArray(trace.data) || trace.data.some(point => !object(point) || !finite(point.freq) || !finite(point.amp))) return false;
    traceIds.add(trace.id); traceNames.add(trace.name);
  }
  if (!validGraph(body, traceIds, traceNames)) return false;
  for (const [name, ids] of Object.entries(body.traceAssignments)) if (!traceNames.has(name) || !strings(ids) || new Set(ids).size !== ids.length || ids.some(id => !paneIds.has(id))) return false;
  for (const [id, name] of Object.entries(body.paneActiveTraceMap)) if (!paneIds.has(id) || !(name === null || (typeof name === 'string' && strings(body.traceAssignments[name]) && body.traceAssignments[name].includes(id)))) return false;
  const markerIds = new Map<string, Record<string, unknown>>();
  for (const marker of body.markers) {
    if (!object(marker) || typeof marker.id !== 'string' || !marker.id || markerIds.has(marker.id) || typeof marker.trace !== 'string' || !traceNames.has(marker.trace) || !finite(marker.freq) || !finite(marker.amp) || (marker.requestedFreq !== undefined && !finite(marker.requestedFreq)) || !['normal','peak','delta'].includes(String(marker.type)) || !(marker.label === null || typeof marker.label === 'string') || typeof marker.interpolated !== 'boolean') return false;
    markerIds.set(marker.id, marker);
  }
  for (const marker of markerIds.values()) if (marker.type === 'delta' ? typeof marker.refId !== 'string' || marker.refId === marker.id || !markerIds.has(marker.refId) || markerIds.get(marker.refId)?.type === 'delta' : marker.refId !== null) return false;
  const lineIds = new Set<number>();
  for (const line of body.refLines) {
    if (!object(line) || !(line.axisUnit === undefined || nullableString(line.axisUnit)) || !finite(line.id) || lineIds.has(line.id) || !['h','v'].includes(String(line.type)) || !finite(line.value) || !strings(line.paneIds) || new Set(line.paneIds).size !== line.paneIds.length || line.paneIds.some(id => !paneIds.has(id)) || (line.type === 'h' && line.paneIds.length > 1) || !(line.label === null || typeof line.label === 'string')) return false;
    lineIds.add(line.id);
  }
  return body.datasets.every(validDataset) && body.displayTraces.every(validDisplay) && (body.selectedTraceName === null || (typeof body.selectedTraceName === 'string' && traceNames.has(body.selectedTraceName)));
}

/** Validate the package before using the permissive legacy normalizer. */
export function migrateWorkspaceV5(raw: unknown): WorkspaceSnapshotV5 | null {
  if (!object(raw)) return null;
  const envelope = raw.kind === 'mergen-scope-workspace';
  if ('kind' in raw && !envelope) return null;
  const body = envelope ? raw.snapshot : raw;
  if (!object(body) || !version(raw.version) || !version(body.version)) return null;
  if (envelope && ((raw.version === 5 || body.version === 5) ? raw.version !== 5 || body.version !== 5 : raw.version !== undefined && body.version !== undefined && raw.version !== body.version)) return null;
  if (!Array.isArray(body.files) && !Array.isArray(body.datasets)) return null;
  if (body.files !== undefined && (!Array.isArray(body.files) || body.files.some(file => !object(file) || !Array.isArray(file.traces)))) return null;
  if (body.datasets !== undefined && !Array.isArray(body.datasets)) return null;
  if (body.panes !== undefined && (!Array.isArray(body.panes) || body.panes.length < 1 || body.panes.length > 8 || body.panes.some(p => !object(p) || typeof p.id !== 'string' || !p.id))) return null;
  if (body.traceAssignments !== undefined && !object(body.traceAssignments)) return null;
  if (object(body.ui) && hueSlots(body.ui.traceHueSlots) === null) return null;
  if (body.version === 5) {
    const paneOrder = Array.isArray(body.panes) ? body.panes.flatMap(pane => object(pane) && typeof pane.id === 'string' ? [pane.id] : []) : [];
    const refLines = migrateLines(body.refLines, paneOrder);
    const panes = Array.isArray(body.panes) ? body.panes.map(pane => {
      if (!object(pane) || !object(pane.settings) || !object(pane.settings.smith)) return pane;
      const smith = pane.settings.smith;
      const labels = smith.labels === true || smith.labels === undefined ? 'normalised' : smith.labels === false ? 'off' : smith.labels;
      const inverted = pane.renderMode === 'smith-inverted';
      const readout = inverted && Array.isArray(smith.readout) ? ['y', ...smith.readout.filter(field => field !== 'y')] : smith.readout;
      return { ...pane, renderMode: inverted ? 'smith' : pane.renderMode, settings: { ...pane.settings, smith: { ...smith, labels, ...(inverted ? { grid: 'y', readout } : {}) } } };
    }) : body.panes;
    if (!refLines || !validCurrent({ ...body, panes, refLines })) return null;
    const snapshot = { ...body, panes, refLines } as unknown as WorkspaceSnapshotV5;
    // Browser preferences and other transient UI keys are not workspace state.
    const { traceColors, traceInterpolations, noiseFilter, noiseSource, ip3Gain } = snapshot.ui;
    const traceHueSlots = hueSlots(snapshot.ui.traceHueSlots);
    if (traceHueSlots === null) return null;
    const selectedRefLineId = selectedLineId(body.ui, body.refLines, refLines);
    const migrated = snapshot.analyses === undefined ? legacyAnalyses(snapshot) : {};
    const typedPanes = snapshot.panes.map(pane => ({ ...pane, typed: pane.typed === true || pane.renderMode !== 'cartesian' && pane.typed === undefined || Object.values(snapshot.traceAssignments).some(ids => ids.includes(pane.id)) }));
    return { ...snapshot, panes: typedPanes, ...migrated, ...(snapshot.analyses ? { analyses: withoutLegacyLive(snapshot.analyses, snapshot.derivedTraces) } : {}), ui: { traceColors, traceHueSlots, traceInterpolations, noiseFilter, noiseSource, ip3Gain, ...(selectedRefLineId !== undefined ? { selectedRefLineId } : {}) } };
  }
  try {
    let normalized = migrateWorkspaceSnapshot(body);
    // Old trace-only files can mix domains. Build one canonical series per source
    // trace instead of assigning all of them to the legacy normalizer's one
    // inferred dataset. Derived traces remain represented by derivedTraces.
    const suppliedDatasets = Array.isArray(body.datasets) && body.datasets.length > 0;
    const suppliedDisplays = Array.isArray(body.displayTraces) && body.displayTraces.length > 0;
    if (!suppliedDatasets && !suppliedDisplays) {
      const replacements = normalized.files.filter(file => !file.touchstoneNetwork && !(file.datasets?.length) && !(file.displayTraces?.length) && file.traces.length > 0);
      if (replacements.length) {
        const obsolete = new Set(normalized.datasets.filter(dataset => replacements.some(file => String(dataset.fileId) === String(file.id))).map(dataset => dataset.id));
        const pairs = replacements.flatMap(file => file.traces.map(trace => {
          const dataset = buildSeriesDatasetFromTrace(trace, trace.domain === 'time' ? 'waveform' : 'spectrum', file.id, file.fileName);
          const series = dataset.series[0];
          if (!series) throw new Error('Missing legacy series');
          const display = { ...buildScalarDisplayTraceFromSeriesDataset(dataset, series, trace), id: trace.id };
          return { dataset, display };
        }));
        normalized = { ...normalized, datasets: [...normalized.datasets.filter(dataset => !obsolete.has(dataset.id)), ...pairs.map(pair => pair.dataset)],
          displayTraces: [...normalized.displayTraces.filter(display => !obsolete.has(display.datasetId)), ...pairs.map(pair => pair.display)] };
      }
    }
    // Current save path supplies explicit canonical collections even when empty.
    // The legacy normalizer treats empty collections as absent and fabricates projections.
    const explicitCollections = Array.isArray(body.datasets) && Array.isArray(body.displayTraces) && Array.isArray(body.files)
      && body.files.every(file => object(file) && Array.isArray(file.datasets) && Array.isArray(file.displayTraces));
    if (!suppliedDisplays) {
      const derivedIds = new Set(normalized.derivedTraces.map(trace => trace.id));
      const ownedDisplays = new Set(normalized.files.flatMap(file => (file.displayTraces ?? []).map(display => display.id)));
      normalized = { ...normalized, displayTraces: normalized.displayTraces.filter(display => !derivedIds.has(display.id) || ownedDisplays.has(display.id)) };
    }
    const legacy = explicitCollections ? { ...normalized, datasets: body.datasets as typeof normalized.datasets, displayTraces: body.displayTraces as typeof normalized.displayTraces } : {
      ...normalized,
      files: normalized.files.map(file => {
        const localDatasets = normalized.datasets.filter(d => String(d.fileId) === String(file.id) || file.datasets?.some(owned => owned.id === d.id));
        const localDisplays = normalized.displayTraces.filter(d => localDatasets.some(dataset => dataset.id === d.datasetId) || file.displayTraces?.some(owned => owned.id === d.id));
        return { ...file, datasets: localDatasets, displayTraces: localDisplays };
      }),
    };
    const sourcePanes = Array.isArray(body.panes) ? body.panes : legacy.panes;
    const ids = sourcePanes.map(p => object(p) ? p.id : undefined);
    if (new Set(ids).size !== ids.length) return null;
    const ui = object(body.ui) ? body.ui : {};
    const panes: WorkspacePaneV5[] = sourcePanes.map((value): WorkspacePaneV5 => {
      const p = value as Record<string, unknown>;
      const s = object(p.settings) ? p.settings : {};
      const smith = object(s.smith) ? s.smith : {};
      const defaults = defaultPaneSettings();
      const readout = Array.isArray(smith.readout) ? smith.readout.filter((x): x is 'z' | 'y' | 'gamma' | 'vswr' | 'return-loss' => ['z','y','gamma','vswr','return-loss'].includes(x)) : defaults.smith.readout;
      const bool = (key: keyof typeof defaults): boolean => typeof s[key] === 'boolean' ? s[key] as boolean : defaults[key] as boolean;
      const bounded = (key: keyof typeof defaults, min: number, max: number): number => finite(s[key]) && Number(s[key]) >= min && Number(s[key]) <= max ? Number(s[key]) : defaults[key] as number;
      return {
        id: String(p.id), title: typeof p.title === 'string' ? p.title : '',
        renderMode: p.renderMode === 'smith-inverted' ? 'smith' : p.renderMode === 'smith' || p.renderMode === 'table' ? p.renderMode : 'cartesian',
        typed: typeof p.typed === 'boolean' ? p.typed : p.renderMode === 'smith' || p.renderMode === 'smith-inverted' || p.renderMode === 'table',
        xLinkGroup: typeof p.xLinkGroup === 'string' ? p.xLinkGroup : null,
        settings: {
          gridMajor: bool('gridMajor'), gridMinor: bool('gridMinor'),
          gridMajorThickness: bounded('gridMajorThickness', 0.5, 5), gridMinorThickness: bounded('gridMinorThickness', 0.5, 5),
          gridMajorOpacity: bounded('gridMajorOpacity', 0, 1), gridMinorOpacity: bounded('gridMinorOpacity', 0, 1),
          gridDashStyle: typeof s.gridDashStyle === 'string' ? s.gridDashStyle : defaults.gridDashStyle,
          showMarkers: bool('showMarkers'), showReferenceLines: bool('showReferenceLines'),
          showLineLabels: bool('showLineLabels'), showMarkerLabels: bool('showMarkerLabels'),
          showSampleDots: typeof s.showSampleDots === 'boolean' ? s.showSampleDots : ui.showDots === true,
          showReadoutNames: typeof s.showReadoutNames === 'boolean' ? s.showReadoutNames : true,
          showZeroLine: typeof s.showZeroLine === 'boolean' ? s.showZeroLine : true,
          smith: {
            grid: p.renderMode === 'smith-inverted' ? 'y' : smith.grid === 'y' || smith.grid === 'both' ? smith.grid : 'z',
            labels: smith.labels === false || smith.labels === 'off' ? 'off' : smith.labels === 'ohms' ? 'ohms' : 'normalised',
            direction: smith.direction === 'ends' || smith.direction === 'off' ? smith.direction : 'chevrons',
            readout: p.renderMode === 'smith-inverted' ? ['y', ...readout.filter(field => field !== 'y')] : readout,
          },
        },
      };
    });
    const valid = new Set(panes.map(p => p.id));
    const assignments = object(body.traceAssignments) ? body.traceAssignments : {};
    const traces = [...legacy.files.flatMap(f => f.traces), ...legacy.derivedTraces];
    const knownIds = new Set(traces.map(trace => trace.id));
    for (const file of legacy.files) {
      for (const display of file.displayTraces ?? []) {
        if (knownIds.has(display.id)) continue;
        const trace = adaptDisplayTraceToLegacyTrace(legacy.datasets, display, { id: file.id, fileName: file.fileName, meta: {}, traces: [] });
        if (trace) { traces.push(trace); knownIds.add(trace.id); }
      }
    }
    const traceAssignments = Object.fromEntries(traces.map(t => {
      const rawIds = assignments[t.name];
      const values = typeof rawIds === 'string' ? [rawIds] : Array.isArray(rawIds) ? rawIds : [];
      return [t.name, [...new Set(values.filter((id): id is string => typeof id === 'string' && valid.has(id)))]];
    }));
    const rawActive = object(body.paneActiveTraceMap) ? body.paneActiveTraceMap : {};
    const paneActiveTraceMap = Object.fromEntries(panes.map(pane => {
      const saved = rawActive[pane.id];
      const names = traces.filter(trace => traceAssignments[trace.name]?.includes(pane.id)).map(trace => trace.name);
      return [pane.id, body.version === 5 && saved === null ? null : typeof saved === 'string' && names.includes(saved) ? saved : names[0] ?? null];
    }));
    const layout = object(body.layout) ? body.layout : {};
    const order = Array.isArray(layout.paneOrder) ? layout.paneOrder.filter((id): id is string => typeof id === 'string' && valid.has(id)) : [];
    const paneOrder = [...new Set([...order, ...panes.map(p => p.id)])];
    const refLines = migrateLines(body.refLines ?? [], panes.map(pane => pane.id));
    if (!refLines) return null;
    const preset = layout.preset === 'columns' || layout.preset === 'grid' || layout.preset === 'one-side' ? layout.preset : 'rows';
    const { paneMode: _paneMode, paneRenderModes: _paneRenderModes, ...base } = legacy;
    const results = object(body.analysisResults) ? body.analysisResults : {};
    if (body.analyses !== undefined && !validAnalyses(body.analyses, legacy.derivedTraces)) return null;
    if (body.droppedViews !== undefined && (!Number.isSafeInteger(body.droppedViews) || Number(body.droppedViews) < 0)) return null;
    const snapshot: WorkspaceSnapshotV5 = {
      ...base, version: 5, panes: panes.map(pane => ({ ...pane, typed: pane.typed || Object.values(traceAssignments).some(ids => ids.includes(pane.id)) })), traceAssignments, paneActiveTraceMap, refLines,
      analysisResults: {
        noiseResults: object(results.noiseResults) ? results.noiseResults as WorkspaceSnapshotV5['analysisResults']['noiseResults'] : {},
        ip3Results: object(results.ip3Results) ? results.ip3Results as WorkspaceSnapshotV5['analysisResults']['ip3Results'] : {},
        peakResults: object(results.peakResults) ? results.peakResults as WorkspaceSnapshotV5['analysisResults']['peakResults'] : {},
        bandwidthResults: object(results.bandwidthResults) ? results.bandwidthResults as WorkspaceSnapshotV5['analysisResults']['bandwidthResults'] : {},
        rippleResults: object(results.rippleResults) ? results.rippleResults as WorkspaceSnapshotV5['analysisResults']['rippleResults'] : {},
        rangeStatsResults: object(results.rangeStatsResults) ? results.rangeStatsResults as WorkspaceSnapshotV5['analysisResults']['rangeStatsResults'] : {},
      },
      activePaneId: typeof body.activePaneId === 'string' && valid.has(body.activePaneId) ? body.activePaneId : panes[0]?.id ?? 'pane-1',
      layout: { preset, paneOrder, sizes: object(layout.sizes) ? Object.fromEntries(Object.entries(layout.sizes).filter(([,v]) => typeof v === 'number' && Number.isFinite(v))) as Record<string, number> : {} },
      ui: { traceColors: legacy.ui.traceColors, ...(object(body.ui) && hueSlots(body.ui.traceHueSlots) ? { traceHueSlots: hueSlots(body.ui.traceHueSlots) ?? undefined } : {}), traceInterpolations: legacy.ui.traceInterpolations, noiseFilter: legacy.ui.noiseFilter, noiseSource: legacy.ui.noiseSource, ip3Gain: legacy.ui.ip3Gain, ...(selectedLineId(body.ui, body.refLines, refLines) !== undefined ? { selectedRefLineId: selectedLineId(body.ui, body.refLines, refLines) } : {}) },
      ...(body.analyses !== undefined ? { analyses: withoutLegacyLive(body.analyses as AnalysisInstance[], legacy.derivedTraces) } : {}),
      ...(body.droppedViews !== undefined ? { droppedViews: Number(body.droppedViews) } : {}),
    };
    return snapshot.analyses === undefined ? { ...snapshot, ...legacyAnalyses(snapshot) } : snapshot;
  } catch {
    return null;
  }
}


