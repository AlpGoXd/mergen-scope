import type { Dataset, NetworkDataset } from '../types/dataset';
import type { DisplayTrace } from '../types/display';
import type { ColumnIdentity, ParsedFile, RawFileRecord, WizardConfig } from '../types/file';
import type { OpenData, OpenTrace } from '../types/open-files-plan';
import type { Trace } from '../types/trace';
import { buildNetworkDatasetFromTouchstone, buildNetworkDerivedScalarTrace, buildNetworkProjectionDisplayTrace, buildScalarDisplayTraceFromSeriesDataset, buildSeriesDatasetFromTrace, convertNetworkDataset } from './dataset-builders';
import { adaptDisplayTraceToLegacyTrace } from './display-trace-adapter';

type Selection = Extract<OpenData['result'], { ok: true }>['selection'];
export interface PrepareOpenInput {
  readonly parsed: ParsedFile;
  readonly rawText: string;
  readonly fileId: string;
  readonly fileName: string;
  readonly prior?: RawFileRecord;
  readonly priorRawText?: string;
  readonly wizardConfig?: WizardConfig;
  readonly recognizedColumns?: boolean;
}
export type PreparedOpenInput = { readonly ok: false; readonly reason: string } | {
  readonly ok: true; readonly file: RawFileRecord; readonly rawText: string;
  readonly selection: Selection; readonly replacementMatches: readonly OpenTrace[];
  readonly removedKeys: readonly string[];
};

type NetworkRef = Extract<DisplayTrace['source'], { sourceType: 'network-parameter' }>;
const networkKey = (s: NetworkRef): string => JSON.stringify(['network', s.parameterFamily, s.basis, s.row, s.col, s.component]);
const columnKey = (column: ColumnIdentity): string => column.header === undefined
  ? JSON.stringify(['column', 'index', column.index])
  : JSON.stringify(['column', 'header', column.header]);
function validColumns(columns: readonly ColumnIdentity[] | undefined, count: number): columns is readonly ColumnIdentity[] {
  if (!columns || columns.length !== count || columns.some(c => !Number.isInteger(c.index) || c.index < 0) || new Set(columns.map(c => c.index)).size !== count) return false;
  const headers = columns.map(c => c.header);
  if (headers.some(h => h !== undefined && !h.trim())) return false;
  if (headers.some(h => h === undefined) && headers.some(h => h !== undefined)) return false;
  return headers.every(h => h === undefined) || new Set(headers).size === count;
}

/** Reconstruct the projection identity for genuine pre-dataset CSV records. */
function legacyTabularColumns(prior: RawFileRecord | undefined, rawText?: string): readonly ColumnIdentity[] | undefined {
  if (!prior || prior.format !== 'tabular' || !prior.wizardConfig) return undefined;
  if (validColumns(prior.columnIdentities, prior.traces.length)) return prior.columnIdentities;
  const config = prior.wizardConfig;
  if (!Number.isInteger(config.skipRows) || config.skipRows < 0 || config.yCols.length !== prior.traces.length || config.yCols.some(index => !Number.isInteger(index) || index < 0) || new Set(config.yCols).size !== config.yCols.length) return undefined;
  const lines = rawText?.split(/\r?\n/).filter(line => line.trim().length > 0) ?? [];
  const headers = config.skipRows > 0 ? lines[config.skipRows - 1]?.split(config.delimiter).map(cell => cell.trim()) : undefined;
  const actualHeaders = headers?.some(cell => cell !== '' && !Number.isFinite(Number(cell))) ? headers : undefined;
  return config.yCols.map(index => ({index,...(actualHeaders?.[index] ? {header:actualHeaders[index]} : {})}));
}

function legacyTabularDisplays(prior: RawFileRecord | undefined, columns: readonly ColumnIdentity[] | undefined): readonly DisplayTrace[] {
  if (!prior || prior.format !== 'tabular' || prior.displayTraces?.length || !validColumns(columns, prior.traces.length)) return [];
  return prior.traces.flatMap((trace, index) => {
    const identity = columns[index];
    if (!identity) return [];
    const dataset = buildSeriesDatasetFromTrace(trace, trace.domain === 'time' ? 'waveform' : 'spectrum', prior.id, prior.fileName);
    const series = dataset.series[0];
    if (!series) return [];
    const display = buildScalarDisplayTraceFromSeriesDataset(dataset, series, trace);
    return [{...display, id:trace.id, compat:{...display.compat,legacyTraceName:trace.name,legacyDisplayName:trace.dn || trace.name}}];
  });
}

/** Resolve the same structural key used by replacement candidates; null means identity is unavailable. */
export function getOpenProjectionKey(file: RawFileRecord, displayIndex: number): string | null {
  const displays = file.displayTraces ?? [];
  const display = displays[displayIndex];
  if (!display) return null;
  if (display.source.sourceType === 'network-parameter') return networkKey(display.source);
  if (file.format === 'tabular') {
    if (!validColumns(file.columnIdentities, displays.length)) return null;
    const column = file.columnIdentities[displayIndex];
    return column ? columnKey(column) : null;
  }
  if (display.source.sourceType !== 'series') return null;
  return displays.length === 1 ? JSON.stringify(['single']) : JSON.stringify(['source-trace', displayIndex]);
}

/** Prepare immutable replacement candidates; caller owns placement, transaction and parsing. */
export function prepareOpenInput(input: PrepareOpenInput): PreparedOpenInput {
  const fail = (reason: string): PreparedOpenInput => ({ ok: false, reason });
  const { parsed, prior, fileId, fileName } = input;
  if (!fileId.trim() || !fileName.trim()) return fail('File ID and name are required.');
  const columns = parsed.columnIdentities;
  const legacyColumns = prior?.displayTraces?.length ? undefined : legacyTabularColumns(prior,input.priorRawText);
  const priorColumns = prior?.columnIdentities ?? legacyColumns;
  let file: RawFileRecord = { id: fileId, fileName, meta: parsed.meta, traces: [], format: parsed.format,
    ...(parsed.touchstoneNetwork ? { touchstoneNetwork: parsed.touchstoneNetwork } : {}),
    ...(input.wizardConfig ? { wizardConfig: input.wizardConfig } : {}),
    ...(columns ? { columnIdentities: columns } : {}),
    ...(prior?.touchstoneControls ? { touchstoneControls: prior.touchstoneControls } : {}),
    ...(prior?.matrixOpen !== undefined ? { matrixOpen: prior.matrixOpen } : {}) };
  const oldDisplays = prior?.displayTraces?.length ? prior.displayTraces : legacyTabularDisplays(prior,legacyColumns);
  if (prior && prior.traces.length && !oldDisplays.length) return fail('Prior traces lack structured display projection identities.');
  const oldByKey = new Map<string, DisplayTrace>();
  const oldTraceByKey = new Map<string, Trace>();
  const network = !!parsed.touchstoneNetwork;
  const tabular = parsed.format === 'tabular';
  if (prior && tabular && !validColumns(priorColumns, oldDisplays.length)) return fail('Prior actual output column identities are unavailable or ambiguous.');
  const usableColumns: boolean = validColumns(columns, parsed.traces.length);
  const uniqueIndices = !!columns && columns.length === parsed.traces.length && columns.every(column => Number.isInteger(column.index) && column.index >= 0) && new Set(columns.map(column => column.index)).size === columns.length;
  if (tabular && (!uniqueIndices || (prior && !usableColumns))) return fail('Actual parsed output column identities are unavailable or ambiguous.');
  if (prior && tabular && priorColumns && columns && (priorColumns[0]?.header === undefined) !== (columns[0]?.header === undefined)) return fail('Cannot safely match headerless and headered column identities.');
  for (let i = 0; i < oldDisplays.length; i++) {
    const display = oldDisplays[i]; if (!display) continue;
    const legacyColumn = prior?.format === 'tabular' && !prior.displayTraces?.length ? legacyColumns?.[i] : undefined;
    const key = prior && (legacyColumn ? columnKey(legacyColumn) : getOpenProjectionKey(prior, i));
    if (!key) return fail('Prior projection has no unambiguous source identity.');
    if (oldByKey.has(key)) return fail('Prior projection identity is ambiguous.');
    const matches = (prior?.traces ?? []).filter(t => t.id === display.id || (t.parameters?.displayTraceId === display.id) || (display.compat?.legacyTraceName && t.name === display.compat.legacyTraceName));
    if (matches.length > 1) return fail('Prior trace identity is ambiguous.');
    if (matches[0] && matches[0].id !== display.id) return fail('Prior trace and display IDs disagree.');
    oldByKey.set(key, display); if (matches[0]) oldTraceByKey.set(key, matches[0]);
  }
  if (prior?.traces.some(t => ![...oldTraceByKey.values()].includes(t))) return fail('A prior trace cannot be matched to a display projection.');
  const datasets: Dataset[] = [];
  const displays: DisplayTrace[] = [];
  const traces: Trace[] = [];
  const refs = new Map<string, OpenTrace>();
  const add = (key: string, fresh: DisplayTrace): boolean => {
    const old = oldByKey.get(key); const oldTrace = oldTraceByKey.get(key);
    const display: DisplayTrace = old ? { ...fresh, id: old.id, hidden: old.hidden, interpolation: old.interpolation,
      compat: { ...fresh.compat, legacyTraceName: oldTrace?.name ?? old.compat?.legacyTraceName, legacyDisplayName: oldTrace?.dn ?? old.compat?.legacyDisplayName, automaticDisplayName: old.compat?.automaticDisplayName } } : fresh;
    const adapted = adaptDisplayTraceToLegacyTrace(datasets, display, file);
    if (!adapted) return false;
    const trace: Trace = oldTrace ? { ...adapted, name: oldTrace.name, dn: oldTrace.dn } : adapted;
    displays.push(display); traces.push(trace); refs.set(key, { id: trace.id, key }); return true;
  };
  let selection: Selection;
  if (network && parsed.touchstoneNetwork) {
    const source = buildNetworkDatasetFromTouchstone(parsed.touchstoneNetwork, fileName, fileId);
    datasets.push(source);
    const cache = new Map<string, NetworkDataset>([[source.parameterFamily, source]]);
    const requests = new Map<string, NetworkRef>();
    for (const [key, display] of oldByKey) {
      if (display.source.sourceType !== 'network-parameter') return fail('Prior and new source types do not match.');
      requests.set(key, display.source);
    }
    const defaultRef = (row: number, col: number): NetworkRef => ({ sourceType: 'network-parameter', parameterFamily: 'S', basis: 'single-ended', row, col, component: 'magnitude-db' });
    const s11 = defaultRef(0, 0); const s21 = defaultRef(1, 0);
    if (source.portCount <= 2) requests.set(networkKey(s11), s11);
    if (source.portCount === 2) requests.set(networkKey(s21), s21);
    const removedKeys: string[] = [];
    for (const [key, ref] of requests) {
      if (ref.row < 0 || ref.col < 0 || !Number.isInteger(ref.row) || !Number.isInteger(ref.col)) return fail('Invalid network projection coordinates.');
      if (ref.row >= source.portCount || ref.col >= source.portCount) { if (oldByKey.has(key)) removedKeys.push(key); continue; }
      if (ref.basis !== source.basis) return fail('Network basis regeneration is unsupported.');
      let dataset = cache.get(ref.parameterFamily);
      if (!dataset && (ref.parameterFamily === 'Y' || ref.parameterFamily === 'Z')) {
        dataset = convertNetworkDataset(source, ref.parameterFamily) ?? undefined;
        if (dataset && dataset.samples.length !== source.samples.length) return fail('Network conversion is unavailable for one or more samples.');
        if (dataset) { cache.set(ref.parameterFamily, dataset); datasets.push(dataset); }
      }
      if (!dataset) return fail(`Network family ${ref.parameterFamily} cannot be regenerated from this source.`);
      const label = `${ref.parameterFamily}${ref.row + 1}${ref.col + 1} ${ref.component}`;
      const opts = { row: ref.row, col: ref.col, label, legacyTraceName: `${fileId}:${key}`, legacyDisplayName: `${fileName} ${label}` };
      const component = ref.component;
      const fresh = component === 'group-delay' || component === 'stability-k' || component === 'stability-mu1' || component === 'stability-mu2' || component === 'stability-muprime'
        ? buildNetworkDerivedScalarTrace(dataset, { ...opts, metric: component as 'group-delay' | 'stability-k' | 'stability-mu1' | 'stability-mu2' | 'stability-muprime' })
        : buildNetworkProjectionDisplayTrace(dataset, { ...opts, component });
      if (!fresh || !add(key, fresh)) return fail(`Network projection ${label} cannot be regenerated.`);
    }
    selection = { kind: 'network', ports: source.portCount, s11: refs.get(networkKey(s11)), s21: refs.get(networkKey(s21)) };
    file = { ...file, datasets, displayTraces: displays, traces, matrixOpen: prior?.matrixOpen ?? true };
    return { ok: true, file, rawText: input.rawText, selection, replacementMatches: [...oldByKey.keys()].flatMap(key => refs.get(key) ? [refs.get(key) as OpenTrace] : []), removedKeys };
  }
  if (oldDisplays.some(d => d.source.sourceType === 'network-parameter')) return fail('Prior and new source types do not match.');
  if (!tabular && prior && (oldDisplays.length !== 1 || parsed.traces.length !== 1)) return fail('Multi-trace non-tabular replacement has ambiguous source identities.');
  for (let i = 0; i < parsed.traces.length; i++) {
    const sourceTrace = parsed.traces[i]; if (!sourceTrace) continue;
    const key = tabular ? columnKey(usableColumns ? (parsed.columnIdentities?.[i] as ColumnIdentity) : {index:parsed.columnIdentities?.[i]?.index ?? -1}) : parsed.traces.length === 1 ? JSON.stringify(['single']) : JSON.stringify(['source-trace', i]);
    const trace = { ...sourceTrace, id: `${fileId}:${key}`, name: `${fileId}:${key}`, file: fileName };
    const dataset = buildSeriesDatasetFromTrace(trace, trace.domain === 'time' ? 'waveform' : 'spectrum', fileId, fileName);
    const series = dataset.series[0]; if (!series) return fail('Parsed trace has no series.');
    datasets.push(dataset);
    if (!add(key, buildScalarDisplayTraceFromSeriesDataset(dataset, series, trace))) return fail('Parsed trace could not be adapted.');
  }
  if (!refs.size) return fail('Parsed input has no traces.');
  const selected = [...refs.values()];
  selection = tabular || selected.length > 1 ? { kind: 'columns', selected, recognized: tabular && (input.recognizedColumns ?? false) } : { kind: 'single', trace: selected[0] as OpenTrace };
  file = { ...file, datasets, displayTraces: displays, traces };
  return { ok: true, file, rawText: input.rawText, selection, replacementMatches: [...oldByKey.keys()].flatMap(key => refs.get(key) ? [refs.get(key) as OpenTrace] : []), removedKeys: [...oldByKey.keys()].filter(key => !refs.has(key)) };
}

