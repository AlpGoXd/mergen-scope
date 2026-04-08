// ============================================================================
// Mergen Scope — Analysis Registry
// ============================================================================
// Ported from: app-modules/analysis-target-helpers.js (354 lines)
// Scope "touchstone" → "network" as per prompt.
// ============================================================================

import type {
  AnalysisItem,
  AnalysisScope,
  AnalysisRegistryEntry,
  AnalysisTarget,
  AnalysisOpenState,
  TouchstoneTraceKind,
  TouchstoneContext,
} from "../../types/analysis.ts";
import type { Dataset, NetworkDataset } from "../../types/dataset.ts";
import type { DisplayTrace } from "../../types/display.ts";
import { getVisibleTraceData } from "../trace-math.ts";
import type { ZoomWindow } from "../../types/marker.ts";
import type { RawFileRecord } from "../../types/file.ts";
import type { Trace, RawTrace } from "../../types/trace.ts";

// ---------------------------------------------------------------------------
// Analysis items — the canonical registry
// ---------------------------------------------------------------------------

/**
 * All analysis tools. Scope "touchstone" renamed to "network".
 * Note: `scope` determines which trace contexts show the item.
 */
export const ANALYSIS_ITEMS: readonly AnalysisItem[] = [
  { id: "noise-psd", title: "Noise PSD", colorVar: "noiseTr", kind: "analysis", group: "measure", scope: "spectrum" },
  { id: "ip3", title: "IP3 / TOI", colorVar: "ip3C", kind: "analysis", group: "measure", scope: "spectrum" },
  { id: "peak-spur-table", title: "Peak Table", colorVar: "tr3", kind: "analysis", group: "measure", scope: "shared" },
  { id: "range-stats", title: "Range Statistics", colorVar: "tr2", kind: "analysis", group: "measure", scope: "shared" },
  { id: "bandwidth-helper", title: "3 dB / 10 dB BW", colorVar: "tr1", kind: "analysis", group: "measure", scope: "shared" },
  { id: "threshold-crossings", title: "Threshold Crossings", colorVar: "refH", kind: "analysis", group: "measure", scope: "shared" },
  { id: "ripple-flatness", title: "Ripple / Flatness", colorVar: "tr5", kind: "analysis", group: "measure", scope: "shared" },
  { id: "occupied-bandwidth", title: "Occupied Bandwidth", colorVar: "tr0", kind: "analysis", group: "measure", scope: "spectrum" },
  { id: "channel-power", title: "Channel Power", colorVar: "accent", kind: "analysis", group: "measure", scope: "spectrum" },
  { id: "vswr", title: "VSWR", colorVar: "tr6", kind: "analysis", group: "touchstone", scope: "network" },
  { id: "return-loss", title: "Return Loss", colorVar: "tr7", kind: "analysis", group: "touchstone", scope: "network" },
  { id: "group-delay", title: "Group Delay", colorVar: "tr8", kind: "analysis", group: "touchstone", scope: "network" },
  { id: "reciprocity-isolation", title: "Reciprocity / Isolation", colorVar: "tr9", kind: "analysis", group: "touchstone", scope: "network" },
  { id: "touchstone-stability", title: "Touchstone Stability", colorVar: "accent", kind: "analysis", group: "touchstone", scope: "network" },
];

// ---------------------------------------------------------------------------
// Open state management
// ---------------------------------------------------------------------------

/** Build a default analysis open state (all closed). */
export function getDefaultAnalysisOpenState(): AnalysisOpenState {
  const state: Record<string, boolean> = {};
  for (const item of ANALYSIS_ITEMS) state[item.id] = false;
  return state;
}

/** Normalize an analysis open state, filling missing items. */
export function normalizeAnalysisOpenState(
  state: Partial<AnalysisOpenState> | null | undefined,
): AnalysisOpenState {
  const next = getDefaultAnalysisOpenState();
  if (state) {
    for (const key of Object.keys(state)) {
      if (typeof state[key] === "boolean") {
        next[key] = state[key] as boolean;
      }
    }
  }
  return next;
}

/** Toggle or set an analysis item's open state. */
export function setAnalysisOpenState(
  prev: AnalysisOpenState,
  id: string | null,
  nextValue?: boolean,
): AnalysisOpenState {
  const next = normalizeAnalysisOpenState(prev);
  if (id == null) return next;
  next[id] = nextValue === undefined ? !next[id] : !!nextValue;
  return next;
}

/** Close all analysis items. */
export function clearAllAnalysisOpenState(
  prev: AnalysisOpenState,
): AnalysisOpenState {
  const next = normalizeAnalysisOpenState(prev);
  for (const key of Object.keys(next)) next[key] = false;
  return next;
}

// ---------------------------------------------------------------------------
// Touchstone trace classification
// ---------------------------------------------------------------------------

/** Get the touchstone trace kind from an analysis target. */
export function getTouchstoneTraceKind(
  target: AnalysisTarget | null | undefined,
): TouchstoneTraceKind | null {
  const touchstone = target?.touchstone ?? null;
  if (!touchstone?.isTouchstone) return null;
  if (touchstone.metric != null) return "scalar-metric";
  const family = String(touchstone.family ?? "S").trim().toUpperCase();
  if (family !== "S") return "touchstone";
  const { row, col } = touchstone;
  if (row != null && col != null && row === col) return "reflection";
  if (row != null && col != null && row !== col) return "transmission";
  return "touchstone";
}

/** Check if the target is a Touchstone reflection trace. */
export function isTouchstoneReflectionTarget(
  target: AnalysisTarget | null | undefined,
): boolean {
  return getTouchstoneTraceKind(target) === "reflection";
}

/** Check if the target is a Touchstone transmission trace. */
export function isTouchstoneTransmissionTarget(
  target: AnalysisTarget | null | undefined,
): boolean {
  return getTouchstoneTraceKind(target) === "transmission";
}

/** Resolve Touchstone context for a trace, optionally using file records. */
export function getTraceTouchstoneContext(
  trace: Trace | null | undefined,
  files?: readonly RawFileRecord[]
): TouchstoneContext | null {
  if (!trace) return null;
  const isRaw = trace.kind === 'raw';
  const fileId = isRaw ? (trace as RawTrace).fileId : null;
  const fileName = isRaw ? (trace as RawTrace).fileName : null;
  const file = files?.find(f => f.id === fileId || f.fileName === fileName) || null;
  
  const network = (isRaw ? (trace as RawTrace).touchstoneNetwork : null) || file?.touchstoneNetwork || null;
  const source = (isRaw ? (trace as RawTrace).networkSource : null) || null;
  
  const isTouchstone = !!(network || source || file?.format === 'touchstone');
  if (!isTouchstone) return null;

  const family = String(source?.family ?? 'S').trim().toUpperCase() || 'S';
  const view = String(source?.view ?? '').trim() || 'dB';
  const row = source?.row ?? null;
  const col = source?.col ?? null;
  const metric = source?.metric ?? null;
  const referenceOhms = source?.referenceOhms ?? network?.referenceOhms ?? null;
  const portCount = source?.portCount ?? network?.portCount ?? null;
  const parameterType = String(source?.parameterType ?? network?.parameterType ?? 'S').trim().toUpperCase() || 'S';
  
  return {
    isTouchstone: true,
    fileId: source?.parentFileId ?? fileId ?? file?.id ?? null,
    fileName: source?.fileName ?? fileName ?? file?.fileName ?? null,
    parameterType,
    portCount,
    family,
    view,
    row,
    col,
    metric,
    referenceOhms,
    freqUnit: network?.freqUnit ?? source?.freqUnit ?? 'Hz',
    dataFormat: network?.dataFormat ?? source?.dataFormat ?? null,
    comments: network?.comments ? [...network.comments] : [],
    samples: network?.samples ?? null,
    network,
    source,
    traceLabel: trace.dn || trace.name || ''
  };
}

function getTouchstoneContextFromDataset(
  dataset: Dataset | null | undefined,
  displayTrace: DisplayTrace | null | undefined,
): TouchstoneContext | null {
  if (!dataset || dataset.family !== 'network') {
    return null;
  }

  const networkDataset = dataset as NetworkDataset;
  const source = displayTrace?.source.sourceType === 'network-parameter' ? displayTrace.source : null;
  const fileName = dataset.fileName ?? null;
  const legacyParameterType = networkDataset.parameterFamily === 'Y' || networkDataset.parameterFamily === 'Z' || networkDataset.parameterFamily === 'H' || networkDataset.parameterFamily === 'G'
    ? networkDataset.parameterFamily
    : 'S';

  return {
    isTouchstone: true,
    fileId: dataset.fileId ?? null,
    fileName,
    parameterType: networkDataset.parameterFamily,
    portCount: networkDataset.portCount,
    family: source?.parameterFamily ?? networkDataset.parameterFamily,
    view: source?.component ?? displayTrace?.defaultView ?? 'cartesian',
    row: source?.row ?? null,
    col: source?.col ?? null,
    metric: source?.component?.startsWith('stability-') || source?.component === 'group-delay' ? source.component : null,
    referenceOhms: networkDataset.referenceOhms,
    freqUnit: 'Hz',
    dataFormat: 'RI',
    comments: [],
    samples: networkDataset.samples,
    network: {
      parameterType: legacyParameterType,
      portCount: networkDataset.portCount,
      referenceOhms: networkDataset.referenceOhms,
      freqUnit: 'Hz',
      dataFormat: 'RI',
      comments: [],
      samples: networkDataset.samples.map((sample) => ({ freq: sample.freqHz, sMatrix: sample.matrix })),
      matrixFormat: 'full',
      version: 1,
    },
    source: source ? {
      parentFileId: dataset.fileId ?? null,
      family: source.parameterFamily,
      view: source.component,
      row: source.row,
      col: source.col,
      metric: source.component.startsWith('stability-') || source.component === 'group-delay' ? source.component : undefined,
      portCount: networkDataset.portCount,
      referenceOhms: networkDataset.referenceOhms,
      parameterType: networkDataset.parameterFamily,
      fileName: fileName ?? undefined,
      freqUnit: 'Hz',
      dataFormat: 'RI',
    } : null,
    traceLabel: displayTrace?.label ?? '',
  };
}

function findDisplayTraceByLegacyName(
  displayTraces: readonly DisplayTrace[] | undefined,
  legacyTraceName: string | null,
): DisplayTrace | null {
  if (!legacyTraceName || !displayTraces) {
    return null;
  }
  return displayTraces.find((item) => item.compat?.legacyTraceName === legacyTraceName) ?? null;
}

function findDatasetById(
  datasets: readonly Dataset[] | undefined,
  datasetId: string | null | undefined,
): Dataset | null {
  if (!datasets || !datasetId) {
    return null;
  }
  return datasets.find((dataset) => dataset.id === datasetId) ?? null;
}

/** 
 * Resolve the current analysis target from pane and trace state.
 * Ported from analysis-target-helpers.js.
 */
export function resolveAnalysisTarget(args: {
  paneId: string;
  paneTraces: Trace[];
  activeTraceName: string | null;
  zoom: ZoomWindow | null;
  files?: readonly RawFileRecord[];
  datasets?: readonly Dataset[];
  displayTraces?: readonly DisplayTrace[];
}): AnalysisTarget {
  const { paneId, paneTraces, activeTraceName, zoom, files, datasets, displayTraces } = args;
  
  const trace = (activeTraceName ? paneTraces.find(t => t.name === activeTraceName) : null) 
    || paneTraces[0] 
    || null;
  const displayTrace = findDisplayTraceByLegacyName(displayTraces, trace?.name ?? activeTraceName ?? null);
  const dataset = findDatasetById(datasets, displayTrace?.datasetId);

  const data = trace ? getVisibleTraceData(trace, zoom).filter(p => isFinite(p.freq) && isFinite(p.amp)) : [];
  
  let rangeHz: ZoomWindow | null = null;
  if (data.length) {
    rangeHz = { left: data[0]!.freq, right: data[data.length - 1]!.freq };
  } else if (zoom) {
    rangeHz = zoom;
  }

  const touchstone = getTouchstoneContextFromDataset(dataset, displayTrace) ?? getTraceTouchstoneContext(trace, files);
  const traceLabel = displayTrace?.label ?? (trace ? (trace.dn || trace.name || '') : '');
  const datasetFamily = dataset?.family ?? (touchstone ? 'network' : trace?.domain === 'time' ? 'waveform' : trace ? 'spectrum' : null);

  if (!trace) {
    return {
      paneId,
      dataset,
      displayTrace,
      datasetFamily,
      trace: null,
      traceLabel: "",
      data: [],
      rangeHz,
      xUnit: "Hz",
      yUnit: "",
      supported: false,
      touchstone: null,
      touchstoneSupported: false,
      touchstoneReason: "No visible trace in the active pane.",
      reason: paneTraces.length ? "Select a trace." : "No visible trace."
    };
  }

  if (!data.length) {
    return {
      paneId,
      dataset,
      displayTrace,
      datasetFamily,
      trace,
      traceLabel,
      data: [],
      rangeHz,
      xUnit: trace.domain === 'time' ? 's' : 'Hz',
      yUnit: trace.units.y ?? '',
      supported: false,
      touchstone,
      touchstoneSupported: !!touchstone,
      touchstoneReason: touchstone ? (touchstone.portCount === 2 ? "" : "Stability is 2-port only.") : "",
      reason: "No visible samples in current range."
    };
  }

  return {
    paneId,
    dataset,
    displayTrace,
    datasetFamily,
    trace,
    traceLabel,
    data,
    rangeHz,
    xUnit: trace.domain === 'time' ? 's' : 'Hz',
    yUnit: trace.units.y ?? '',
    supported: true,
    touchstone,
    touchstoneSupported: !!touchstone,
    touchstoneReason: touchstone ? (touchstone.portCount === 2 ? "" : "Stability is 2-port only.") : "",
    reason: ""
  };
}

// ---------------------------------------------------------------------------
// Analysis item visibility
// ---------------------------------------------------------------------------

function isTouchstoneTarget(target: AnalysisTarget | null | undefined): boolean {
  return !!(target?.datasetFamily === 'network' || target?.touchstone?.isTouchstone);
}

function getAnalysisScope(item: AnalysisItem): AnalysisScope {
  return item?.scope ?? "shared";
}

/** Get the display title for an analysis item, with context-dependent overrides. */
export function getAnalysisDisplayTitle(
  item: AnalysisItem,
  target: AnalysisTarget | null | undefined,
): string {
  if (!item) return "";
  if (item.id === "peak-spur-table" && isTouchstoneTarget(target)) return "Peak Table";
  if (item.id === "bandwidth-helper" && isTouchstoneTarget(target)) return "Passband Metrics";
  return item.title;
}

/** Determine if an analysis item should be visible for the given target. */
export function isAnalysisItemVisible(
  item: AnalysisItem,
  target: AnalysisTarget | null | undefined,
): boolean {
  if (!item) return false;

  const family = target?.datasetFamily ?? (target?.touchstone ? 'network' : target?.trace?.domain === 'time' ? 'waveform' : 'spectrum');

  const scope = getAnalysisScope(item);

  if (family === 'waveform') {
    return item.id === 'threshold-crossings' || item.id === 'range-stats';
  }

  if (scope === "network") {
    if (!isTouchstoneTarget(target)) return false;
    if (item.id === "vswr" || item.id === "return-loss") return isTouchstoneReflectionTarget(target);
    if (item.id === "reciprocity-isolation") return isTouchstoneTransmissionTarget(target);
    return true;
  }

  if (scope === "spectrum") return family === 'spectrum';

  return family === 'spectrum' || family === 'network'; // "shared"
}

// ---------------------------------------------------------------------------
// Registry builder
// ---------------------------------------------------------------------------

/** Options for building the analysis registry. */
export interface MakeRegistryOptions {
  readonly target?: AnalysisTarget | null;
  readonly extraItems?: readonly AnalysisItem[];
}

/** Build the filtered, stateful analysis registry for the UI. */
export function makeAnalysisRegistry(
  openState: AnalysisOpenState,
  counts: Readonly<Record<string, number>> | null | undefined,
  opts?: MakeRegistryOptions,
): AnalysisRegistryEntry[] {
  const state = normalizeAnalysisOpenState(openState);
  const resultCounts = counts ?? {};
  let items: readonly AnalysisItem[] = ANALYSIS_ITEMS.slice();
  if (opts?.extraItems) items = [...items, ...opts.extraItems];
  const target = opts?.target ?? null;

  return items
    .filter((item) => isAnalysisItemVisible(item, target))
    .map((item) => ({
      id: item.id,
      title: getAnalysisDisplayTitle(item, target),
      kind: item.kind,
      group: item.group,
      scope: getAnalysisScope(item),
      colorVar: item.colorVar,
      isOpen: !!state[item.id],
      resultCount: resultCounts[item.id] ?? 0,
    }));
}

/** Look up an analysis item by ID. */
export function getAnalysisItem(id: string): AnalysisItem | null {
  return ANALYSIS_ITEMS.find((item) => item.id === id) ?? null;
}
