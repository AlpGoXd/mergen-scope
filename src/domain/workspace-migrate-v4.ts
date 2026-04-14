import type { Trace, RawTrace, DerivedTrace } from '../types/trace.ts';
import type { TouchstoneNetwork, TouchstoneParameterType } from '../types/touchstone.ts';
import type {
  WorkspaceSnapshot,
  WorkspaceDatasetRecord,
  WorkspaceDisplayTraceRecord,
  WorkspaceFileRecord,
  WorkspaceDatasetFamily,
  WorkspaceDatasetCapabilities,
  WorkspaceNetworkDatasetRecord,
  WorkspaceSpectrumDatasetRecord,
  WorkspaceDisplayViewMode,
  WorkspaceScalarDisplayTrace,
  WorkspaceProvenance,
  WorkspaceTransformStep,
  WorkspaceDisplayTraceSourceRef,
} from '../types/workspace.ts';
import { normalizePanes, normalizeTracePaneMap, normalizePaneActiveTraceMap } from './pane-math.ts';
import { normalizeAnalysisOpenState } from './analysis/registry.ts';

const CURRENT_VERSION = 4;

type SnapshotLike = Partial<WorkspaceSnapshot> & {
  readonly kind?: string;
  readonly snapshot?: Partial<WorkspaceSnapshot> | null;
};

function asArray<T>(value: unknown): readonly T[] {
  return Array.isArray(value) ? (value as readonly T[]) : [];
}

function toSnapshotLike(raw: unknown): Partial<WorkspaceSnapshot> | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as SnapshotLike;
  if (candidate.kind === 'mergen-scope-workspace' && candidate.snapshot && typeof candidate.snapshot === 'object') {
    return candidate.snapshot;
  }
  return candidate;
}

function datasetId(fileId: string | number | null | undefined, suffix: string): string {
  return `ds-${String(fileId ?? 'file')}-${suffix}`;
}

function capabilitiesForFamily(family: WorkspaceDatasetFamily): WorkspaceDatasetCapabilities {
  switch (family) {
    case 'network':
      return { supportsSmithView: true, supportsPolarView: true, supportsGroupDelay: true, supportsStabilityAnalysis: true, supportsEyeDiagram: false, supportsConstellation: false, supportsBERAnalysis: false, supportsFftView: false };
    case 'waveform':
      return { supportsSmithView: false, supportsPolarView: false, supportsGroupDelay: false, supportsStabilityAnalysis: false, supportsEyeDiagram: true, supportsConstellation: false, supportsBERAnalysis: false, supportsFftView: true };
    case 'iq':
      return { supportsSmithView: false, supportsPolarView: false, supportsGroupDelay: false, supportsStabilityAnalysis: false, supportsEyeDiagram: true, supportsConstellation: true, supportsBERAnalysis: true, supportsFftView: false };
    case 'symbol':
      return { supportsSmithView: false, supportsPolarView: false, supportsGroupDelay: false, supportsStabilityAnalysis: false, supportsEyeDiagram: false, supportsConstellation: true, supportsBERAnalysis: true, supportsFftView: false };
    default:
      return { supportsSmithView: false, supportsPolarView: false, supportsGroupDelay: false, supportsStabilityAnalysis: false, supportsEyeDiagram: false, supportsConstellation: false, supportsBERAnalysis: false, supportsFftView: false };
  }
}

function provenance(rootDatasetId: string, step: WorkspaceTransformStep): WorkspaceProvenance {
  return { rootDatasetIds: [rootDatasetId], transformSteps: [step] };
}

function importStep(id: string, label: string, inputDatasetIds: readonly string[], params: Readonly<Record<string, unknown>> = {}): WorkspaceTransformStep {
  return { id, kind: 'import', label, params, inputDatasetIds };
}

function scalarSeries(trace: Trace): WorkspaceSpectrumDatasetRecord['series'][number] {
  return {
    id: trace.id,
    label: trace.dn || trace.name,
    xUnit: trace.units?.x ?? null,
    yUnit: trace.units?.y ?? null,
    samples: trace.data.map((point) => ({ x: point.freq, y: point.amp })),
  };
}

function buildNetworkDataset(file: WorkspaceFileRecord): WorkspaceNetworkDatasetRecord {
  const network = file.touchstoneNetwork!;
  const id = datasetId(file.id, 'network');
  return {
    id,
    family: 'network',
    kind: 'source',
    label: file.fileName,
    fileId: file.id,
    fileName: file.fileName,
    hidden: false,
    isUniform: true,
    provenance: provenance(id, importStep(`import-${id}`, 'Import Touchstone file', [], { fileName: file.fileName, parameterFamily: network.parameterType })),
    capabilities: capabilitiesForFamily('network'),
    xDomain: 'frequency',
    parameterFamily: 'S',
    basis: 'single-ended',
    portCount: network.portCount,
    referenceOhms: [...network.referenceOhms],
    samples: network.samples.map((sample) => ({ freqHz: sample.freq, matrix: sample.sMatrix })),
  };
}

function buildSeriesDataset(file: WorkspaceFileRecord): WorkspaceDatasetRecord {
  const traces = file.traces ?? [];
  const family: 'waveform' | 'spectrum' = traces.some((trace) => trace.domain === 'time') ? 'waveform' : 'spectrum';
  const id = datasetId(file.id, family);
  const isUniform = traces.every((trace) => trace.isUniform ?? false);
  if (family === 'waveform') {
    return {
      id,
      family: 'waveform',
      kind: 'source',
      label: file.fileName,
      fileId: file.id,
      fileName: file.fileName,
      hidden: false,
      isUniform,
      provenance: provenance(id, importStep(`import-${id}`, 'Import file', [], { fileName: file.fileName })),
      capabilities: capabilitiesForFamily('waveform'),
      xDomain: 'time',
      series: traces.map(scalarSeries),
    };
  }
  return {
    id,
    family: 'spectrum',
    kind: 'source',
    label: file.fileName,
    fileId: file.id,
    fileName: file.fileName,
    hidden: false,
    isUniform,
    provenance: provenance(id, importStep(`import-${id}`, 'Import file', [], { fileName: file.fileName })),
    capabilities: capabilitiesForFamily('spectrum'),
    xDomain: 'frequency',
    series: traces.map(scalarSeries),
  };
}

function buildLegacyDataset(file: WorkspaceFileRecord): WorkspaceDatasetRecord {
  if (file.datasets?.length) return file.datasets[0]!;
  if (file.touchstoneNetwork) return buildNetworkDataset(file);
  return buildSeriesDataset(file);
}

function touchstoneParameterType(parameterFamily: WorkspaceNetworkDatasetRecord['parameterFamily']): TouchstoneParameterType {
  return parameterFamily === 'S' || parameterFamily === 'Y' || parameterFamily === 'Z' || parameterFamily === 'G' || parameterFamily === 'H'
    ? parameterFamily
    : 'S';
}

function buildTouchstoneNetworkFromDataset(dataset: WorkspaceNetworkDatasetRecord): TouchstoneNetwork {
  return {
    parameterType: touchstoneParameterType(dataset.parameterFamily),
    portCount: dataset.portCount,
    referenceOhms: [...dataset.referenceOhms],
    freqUnit: 'Hz',
    dataFormat: 'MA',
    comments: [],
    samples: dataset.samples.map((sample) => ({ freq: sample.freqHz, sMatrix: sample.matrix })),
    matrixFormat: 'full',
    version: 1,
  };
}

function legacyDisplaySource(trace: Trace): WorkspaceDisplayTraceSourceRef {
  const source = (trace as RawTrace).networkSource;
  if (source) {
    const view = String(source.view ?? '').trim().toLowerCase();
    const component =
      view === 'phase' ? 'phase' :
      view === 'real' ? 'real' :
      view === 'imag' ? 'imag' :
      view === 'vswr' ? 'vswr' :
      view === 'return-loss' ? 'return-loss' :
      view === 'group-delay' ? 'group-delay' :
      view === 'k' ? 'stability-k' :
      view === 'mu1' ? 'stability-mu1' :
      view === 'mu2' ? 'stability-mu2' :
      view === 'muprime' ? 'stability-muprime' :
      view === 'mag' ? 'magnitude-linear' :
      'complex';
    const family = String(source.family ?? 'S').toUpperCase();
    return {
      sourceType: 'network-parameter',
      parameterFamily: family === 'S' || family === 'Y' || family === 'Z' || family === 'ABCD' || family === 'H' || family === 'G' || family === 'T' ? family : 'S',
      basis: 'single-ended',
      row: Number.isFinite(source.row) ? Number(source.row) : 0,
      col: Number.isFinite(source.col) ? Number(source.col) : 0,
      component,
    };
  }
  if (trace.domain === 'time') {
    return { sourceType: 'series', datasetFamily: 'waveform', seriesId: trace.id };
  }
  return { sourceType: 'series', datasetFamily: 'spectrum', seriesId: trace.id };
}

function legacyDisplayViews(trace: Trace): readonly WorkspaceDisplayViewMode[] {
  const source = (trace as RawTrace).networkSource;
  if (source || (trace as RawTrace).touchstoneNetwork) return ['cartesian', 'smith', 'polar'];
  if (trace.domain === 'time') return ['cartesian', 'eye'];
  return ['cartesian'];
}

function legacyDisplayView(trace: Trace): WorkspaceDisplayViewMode {
  const source = (trace as RawTrace).networkSource;
  if (source?.view === 'Smith') return 'smith';
  if (source?.view === 'Polar') return 'polar';
  if (trace.domain === 'time') return 'eye';
  return 'cartesian';
}

function legacySemantics(trace: Trace): WorkspaceScalarDisplayTrace['semantics'] {
  const source = (trace as RawTrace).networkSource;
  const unit = String(trace.units?.y ?? '').toLowerCase();
  if (trace.domain === 'time') return 'time-amplitude';
  if (source?.metric) return 'stability';
  if (source?.view === 'Phase') return 'phase';
  if (source?.view === 'Real') return 'real';
  if (source?.view === 'Imag') return 'imag';
  if (unit.includes('/hz')) return 'power-density';
  if (unit.includes('db')) return 'magnitude';
  return 'custom';
}

function displayTraceFromLegacy(trace: Trace, datasetIdValue: string): WorkspaceDisplayTraceRecord {
  const shared = {
    label: trace.dn || trace.name,
    datasetId: datasetIdValue,
    family: trace.family,
    isUniform: trace.isUniform ?? false,
    interpolation: trace.interpolation,
    provenance: {
      parentDatasetId: datasetIdValue,
      parentDisplayTraceIds: trace.sourceTraceIds ?? [],
      transformSteps: trace.operationType ? [String(trace.operationType)] : ['import'],
    },
    source: legacyDisplaySource(trace),
    supportedViews: legacyDisplayViews(trace),
    defaultView: legacyDisplayView(trace),
    valueType: 'scalar' as const,
    xUnit: trace.units?.x ?? null,
    yUnit: trace.units?.y ?? null,
    semantics: legacySemantics(trace),
    points: trace.data.map((point) => ({ x: point.freq, y: point.amp })),
  };
  return trace.kind === 'derived'
    ? { id: trace.id, kind: 'derived-trace', ...shared }
    : { id: trace.id, kind: 'dataset-projection', ...shared };
}

function derivedTraceFromLegacy(trace: DerivedTrace, datasetIdValue: string): WorkspaceDisplayTraceRecord {
  return {
    id: trace.id,
    kind: 'derived-trace',
    label: trace.dn || trace.name,
    datasetId: datasetIdValue,
    family: trace.family,
    isUniform: trace.isUniform ?? false,
    interpolation: trace.interpolation,
    provenance: {
      parentDatasetId: datasetIdValue,
      parentDisplayTraceIds: trace.sourceTraceIds ?? [],
      transformSteps: trace.operationType ? [String(trace.operationType)] : ['derived'],
    },
    source: trace.domain === 'time'
      ? { sourceType: 'series', datasetFamily: 'waveform', seriesId: trace.id }
      : { sourceType: 'series', datasetFamily: 'spectrum', seriesId: trace.id },
    supportedViews: ['cartesian'],
    defaultView: 'cartesian',
    valueType: 'scalar',
    xUnit: trace.units?.x ?? null,
    yUnit: trace.units?.y ?? null,
    semantics: 'custom',
    points: trace.data.map((point) => ({ x: point.freq, y: point.amp })),
  };
}

function legacyTraceFromDisplay(displayTrace: WorkspaceDisplayTraceRecord, dataset: WorkspaceDatasetRecord): Trace {
  const scalarDisplay = displayTrace as WorkspaceScalarDisplayTrace;
  const data = scalarDisplay.points.map((point) => ({ freq: point.x, amp: point.y }));
  if (displayTrace.kind === 'derived-trace') {
    return {
      id: displayTrace.id,
      kind: 'derived',
      sourceTraceIds: displayTrace.provenance.parentDisplayTraceIds.length > 0 ? [...displayTrace.provenance.parentDisplayTraceIds] : [displayTrace.id],
      operationType: 'derived',
      parameters: { semantics: displayTrace.semantics },
      units: { x: scalarDisplay.xUnit ?? null, y: scalarDisplay.yUnit ?? null },
      paneId: null,
      name: displayTrace.label.replace(/\s+/g, '_'),
      mode: '',
      detector: '',
      family: displayTrace.family,
      domain: dataset.family === 'waveform' ? 'time' : 'frequency',
      data,
      file: dataset.fileName ?? null,
      dn: displayTrace.label,
      isUniform: displayTrace.isUniform ?? dataset.isUniform ?? false,
      interpolation: displayTrace.interpolation,
    };
  }

  return {
    id: displayTrace.id,
    kind: 'raw',
    sourceTraceIds: [displayTrace.id],
    operationType: null,
    parameters: null,
    units: { x: scalarDisplay.xUnit ?? null, y: scalarDisplay.yUnit ?? null },
    paneId: null,
    name: displayTrace.label.replace(/\s+/g, '_'),
    mode: '',
    detector: '',
    family: displayTrace.family,
    domain: dataset.family === 'waveform' ? 'time' : 'frequency',
    data,
    file: dataset.fileName ?? null,
    dn: displayTrace.label,
    isUniform: displayTrace.isUniform ?? dataset.isUniform ?? false,
    interpolation: displayTrace.interpolation,
    fileId: dataset.fileId ?? null,
    fileName: dataset.fileName ?? null,
  };
}

function buildDatasets(files: readonly WorkspaceFileRecord[], rawDatasets: readonly WorkspaceDatasetRecord[]): WorkspaceDatasetRecord[] {
  if (rawDatasets.length > 0) return [...rawDatasets];
  return files.flatMap((file) => file.datasets?.length ? [...file.datasets] : [buildLegacyDataset(file)]);
}

function collectDisplayTraces(files: readonly WorkspaceFileRecord[], datasets: readonly WorkspaceDatasetRecord[]): WorkspaceDisplayTraceRecord[] {
  const result: WorkspaceDisplayTraceRecord[] = [];
  for (const file of files) {
    if (file.displayTraces?.length) {
      result.push(...file.displayTraces);
      continue;
    }
    const fileDatasets = datasets.filter((dataset) => String(dataset.fileId) === String(file.id));
    const datasetByFamily = new Map<string, string>();
    for (const dataset of fileDatasets) {
      if (dataset.family === 'network') {
        datasetByFamily.set((dataset as WorkspaceNetworkDatasetRecord).parameterFamily, dataset.id);
      }
    }
    const defaultDatasetId = fileDatasets[0]?.id ?? datasetId(file.id, 'legacy');
    for (const trace of file.traces ?? []) {
      const source = (trace as RawTrace).networkSource;
      const datasetIdValue = source?.family && datasetByFamily.has(source.family) ? datasetByFamily.get(source.family)! : defaultDatasetId;
      result.push(displayTraceFromLegacy(trace, datasetIdValue));
    }
  }
  return result;
}

function collectDerivedDisplayTraces(derivedTraces: readonly DerivedTrace[], datasets: readonly WorkspaceDatasetRecord[]): WorkspaceDisplayTraceRecord[] {
  const result: WorkspaceDisplayTraceRecord[] = [];
  for (const trace of derivedTraces) {
    const dataset = datasets.find((item) => item.fileName != null && item.fileName === trace.file) ?? datasets[0];
    result.push(derivedTraceFromLegacy(trace, dataset?.id ?? datasetId('derived', 'root')));
  }
  return result;
}

function synthesizeLegacyFiles(datasets: readonly WorkspaceDatasetRecord[], displayTraces: readonly WorkspaceDisplayTraceRecord[]): WorkspaceFileRecord[] {
  const grouped = new Map<string, WorkspaceDisplayTraceRecord[]>();
  for (const displayTrace of displayTraces) {
    const list = grouped.get(displayTrace.datasetId) ?? [];
    list.push(displayTrace);
    grouped.set(displayTrace.datasetId, list);
  }

  const filesByKey = new Map<string, WorkspaceFileRecord>();
  for (const dataset of datasets) {
    const key = String(dataset.fileId ?? dataset.id);
    const existing = filesByKey.get(key);
    const relatedDisplays = grouped.get(dataset.id) ?? [];
    const projectedTraces = relatedDisplays.filter((displayTrace) => displayTrace.kind === 'dataset-projection').map((displayTrace) => legacyTraceFromDisplay(displayTrace, dataset));
    const next: WorkspaceFileRecord = existing ?? {
      id: dataset.fileId ?? dataset.id,
      fileName: dataset.fileName ?? dataset.label,
      meta: {},
      traces: projectedTraces,
      format: dataset.family === 'network' ? 'touchstone' : dataset.family === 'waveform' ? 'tabular' : 'rs-dat',
      touchstoneNetwork: dataset.family === 'network' && dataset.kind === 'source' ? buildTouchstoneNetworkFromDataset(dataset as WorkspaceNetworkDatasetRecord) : undefined,
      datasets: [dataset],
      displayTraces: relatedDisplays,
    };

    if (existing) {
      filesByKey.set(key, {
        ...existing,
        traces: [...existing.traces, ...projectedTraces],
        datasets: [...(existing.datasets ?? []), dataset],
        displayTraces: [...(existing.displayTraces ?? []), ...relatedDisplays],
        touchstoneNetwork: existing.touchstoneNetwork ?? next.touchstoneNetwork,
      });
      continue;
    }

    filesByKey.set(key, next);
  }

  return [...filesByKey.values()];
}

function synthesizeDerivedTraces(displayTraces: readonly WorkspaceDisplayTraceRecord[], datasets: readonly WorkspaceDatasetRecord[]): DerivedTrace[] {
  const result: DerivedTrace[] = [];
  for (const displayTrace of displayTraces) {
    if (displayTrace.kind !== 'derived-trace') continue;
    const dataset = datasets.find((item) => item.id === displayTrace.datasetId) ?? datasets[0];
    if (!dataset) continue;
    result.push(legacyTraceFromDisplay(displayTrace, dataset) as DerivedTrace);
  }
  return result;
}

function defaultUiState(): WorkspaceSnapshot['ui'] {
  return {
    showSidebar: true,
    showDetailedFiles: true,
    showRightPanel: true,
    showMeta: false,
    showMarkers: false,
    showMarkerTools: false,
    showPaneTools: false,
    showSearchTools: false,
    showLineTools: false,
    showViewTools: false,
    showDots: false,
    showDT: false,
    theme: 'dark',
    lockLinesAcrossPanes: false,
    searchDirection: 'left',
    newMarkerArmed: false,
    markerTrace: '',
    selectedMkrIdx: null,
    dRef: null,
    refMode: null,
    selectedRefLineId: null,
    showTouchstoneControls: false,
    showTraceOps: false,
    showImportExportPanel: false,
    traceOpsOpenSections: { offset: false, scale: false, smoothing: false, subtract: false },
    showAnalysisPanel: false,
    noiseFilter: 'gaussian',
    noiseSource: null,
    ip3Gain: '',
    dtTrace: null,
    traceColors: {},
    traceInterpolations: {},
  };
}

export function migrateWorkspaceSnapshot(raw: unknown): WorkspaceSnapshot {
  const input = toSnapshotLike(raw);
  const legacyFiles = asArray<WorkspaceFileRecord>(input?.files).map((file) => ({
    ...file,
    traces: asArray<Trace>(file.traces),
    datasets: asArray<WorkspaceDatasetRecord>(file.datasets),
    displayTraces: asArray<WorkspaceDisplayTraceRecord>(file.displayTraces),
  }));
  const rawDerivedTraces = asArray<DerivedTrace>(input?.derivedTraces);
  const rawDatasets = asArray<WorkspaceDatasetRecord>(input?.datasets);
  const rawDisplayTraces = asArray<WorkspaceDisplayTraceRecord>(input?.displayTraces);

  const datasets = buildDatasets(legacyFiles, rawDatasets);
  const displayTraces = rawDisplayTraces.length > 0 ? [...rawDisplayTraces] : collectDisplayTraces(legacyFiles, datasets).concat(collectDerivedDisplayTraces(rawDerivedTraces, datasets));
  const files = legacyFiles.length > 0 ? legacyFiles : synthesizeLegacyFiles(datasets, displayTraces);
  const derivedTraces = rawDerivedTraces.length > 0 ? rawDerivedTraces : synthesizeDerivedTraces(displayTraces, datasets);

  const paneMode = Math.max(1, Math.min(4, input?.paneMode ?? 1));
  const panes = normalizePanes(input?.panes, paneMode);
  const vis = input?.vis ? { ...input.vis } : {};
  const paneRenderModes = input?.paneRenderModes ? { ...input.paneRenderModes } : {};
  const activePaneId = input?.activePaneId || 'pane-1';

  const allTraces: Trace[] = [];
  for (const file of files) {
    allTraces.push(...(file.traces ?? []));
  }
  allTraces.push(...derivedTraces);

  const traceAssignments = normalizeTracePaneMap(allTraces, input?.traceAssignments ?? null, panes);
  const paneActiveTraceMap = normalizePaneActiveTraceMap(allTraces, traceAssignments, panes, input?.paneActiveTraceMap ?? null);

  return {
    version: CURRENT_VERSION,
    files,
    datasets,
    displayTraces,
    derivedTraces,
    vis,
    paneMode,
    panes,
    paneRenderModes,
    activePaneId,
    traceAssignments,
    paneActiveTraceMap,
    xZoomState: input?.xZoomState ? { ...input.xZoomState } : { zoomAll: false, sharedZoom: null, paneXZooms: {} },
    yZoomState: input?.yZoomState ? { ...input.yZoomState } : { paneYZooms: {} },
    ui: input?.ui ? { ...defaultUiState(), ...input.ui } : defaultUiState(),
    markers: asArray(input?.markers),
    refLines: asArray(input?.refLines),
    savedNoise: asArray(input?.savedNoise),
    savedIP3: asArray(input?.savedIP3),
    analysisOpenState: normalizeAnalysisOpenState(input?.analysisOpenState),
    selectedTraceName: typeof input?.selectedTraceName === 'string' ? input.selectedTraceName : null,
  };
}
