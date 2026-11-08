import type { RawFileRecord } from '../../types/file.ts';
import type { TouchstoneSelectionState, TouchstoneFamily, TouchstoneView } from '../../types/touchstone.ts';
import type { Dataset, NetworkDataset } from '../../types/dataset.ts';
import type { DisplayTrace } from '../../types/display.ts';
import { buildNetworkDatasetFromTouchstone, buildNetworkProjectionDisplayTrace, buildNetworkDerivedScalarTrace, convertNetworkDataset } from '../dataset-builders.ts';
import { adaptDisplayTracesToLegacyTraces } from '../display-trace-adapter.ts';

function getSourceNetworkDataset(file: RawFileRecord): NetworkDataset | null {
  const existing = (file.datasets ?? []).find((dataset): dataset is NetworkDataset => dataset.family === 'network' && dataset.kind === 'source') ?? null;
  if (existing) {
    return existing;
  }
  return file.touchstoneNetwork ? buildNetworkDatasetFromTouchstone(file.touchstoneNetwork, file.fileName, file.id) : null;
}

function getDerivedNetworkDatasets(file: RawFileRecord): NetworkDataset[] {
  return (file.datasets ?? []).filter((dataset): dataset is NetworkDataset => dataset.family === 'network' && dataset.kind === 'derived');
}

function getOrCreateDataset(file: RawFileRecord, family: TouchstoneFamily, cache: Map<TouchstoneFamily, NetworkDataset>): NetworkDataset | null {
  if (cache.has(family)) {
    return cache.get(family) ?? null;
  }

  const source = getSourceNetworkDataset(file);
  if (!source) {
    return null;
  }

  if (family === 'S') {
    cache.set(family, source);
    return source;
  }

  const existing = getDerivedNetworkDatasets(file).find((dataset) => dataset.parameterFamily === family) ?? null;
  if (existing) {
    cache.set(family, existing);
    return existing;
  }

  const derived = convertNetworkDataset(source, family);
  if (derived) {
    cache.set(family, derived);
  }
  return derived;
}

function viewToComponent(view: Exclude<TouchstoneView, 'Group delay'>): 'magnitude-db' | 'magnitude-linear' | 'phase' | 'real' | 'imag' | 'vswr' | 'return-loss' {
  if (view === 'dB') return 'magnitude-db';
  if (view === 'Mag') return 'magnitude-linear';
  if (view === 'Phase') return 'phase';
  if (view === 'Real') return 'real';
  if (view === 'VSWR') return 'vswr';
  if (view === 'Return loss') return 'return-loss';
  return 'imag';
}

function getAllowedViews(family: TouchstoneFamily): readonly TouchstoneView[] {
  return family === 'S'
    ? ['dB', 'Mag', 'Phase', 'Real', 'Imag', 'VSWR', 'Return loss', 'Group delay']
    : ['Mag', 'Phase', 'Real', 'Imag', 'Group delay'];
}

function getFamilyDefaultView(family: TouchstoneFamily): TouchstoneView {
  return family === 'S' ? 'dB' : 'Mag';
}

function sanitizeView(family: TouchstoneFamily, view: TouchstoneView): TouchstoneView {
  return getAllowedViews(family).includes(view) ? view : getFamilyDefaultView(family);
}

function makeTouchstoneTraceLabel(file: RawFileRecord, family: TouchstoneFamily, row: number, col: number, view: TouchstoneView): string {
  return `${file.fileName} ${family}${row}${col} ${view}`;
}

function makeTouchstoneTraceBaseName(file: RawFileRecord, family: TouchstoneFamily, row: number, col: number, view: TouchstoneView): string {
  return `${file.fileName.replace(/\.[^.]+$/, '')}_${family}${row}${col}_${view}__${file.id}`;
}

function makeUniqueInstanceKey(file: RawFileRecord, family: TouchstoneFamily, row: number, col: number, view: TouchstoneView): string {
  const baseName = makeTouchstoneTraceBaseName(file, family, row, col, view);
  const existing = new Set((file.displayTraces ?? []).map(display => display.compat?.legacyTraceName ?? ''));
  let next = 1;
  while (existing.has(`${baseName}__${next}`)) next += 1;
  return String(next);
}

/** Default selection state for a new Touchstone file. */
export function makeDefaultTouchstoneState(file: RawFileRecord): TouchstoneSelectionState {
  const portCount = file.touchstoneNetwork?.portCount ?? 0;
  const selectedCellsByFamily: Record<TouchstoneFamily, Record<string, TouchstoneView[]>> = {
    S: {}, Y: {}, Z: {}, ABCD: {}
  };

  if (portCount === 1) {
    selectedCellsByFamily.S['1:1'] = ['dB'];
  } else if (portCount === 2) {
    selectedCellsByFamily.S['2:1'] = ['dB'];
    selectedCellsByFamily.S['1:1'] = ['dB'];
  }

  return {
    activeFamily: 'S',
    isExpanded: true,
    activeViewByFamily: { S: 'dB', Y: 'Mag', Z: 'Mag', ABCD: 'Mag' },
    selectedCellsByFamily,
  };
}

/** Recover selections from persisted display traces when loading older workspaces. */
export function touchstoneStateFromFile(file: RawFileRecord): TouchstoneSelectionState {
  const state = makeDefaultTouchstoneState(file);
  state.selectedCellsByFamily.S = {}; state.selectedCellsByFamily.Y = {}; state.selectedCellsByFamily.Z = {}; state.selectedCellsByFamily.ABCD = {};
  for (const display of file.displayTraces ?? []) {
    const source = display.source;
    if (source.sourceType !== 'network-parameter' || !['S','Y','Z','ABCD'].includes(source.parameterFamily)) continue;
    const family = source.parameterFamily as TouchstoneFamily;
    const view: TouchstoneView | null = source.component === 'magnitude-db' ? 'dB' : source.component === 'magnitude-linear' ? 'Mag' : source.component === 'phase' ? 'Phase' : source.component === 'real' ? 'Real' : source.component === 'imag' ? 'Imag' : source.component === 'vswr' ? 'VSWR' : source.component === 'return-loss' ? 'Return loss' : source.component === 'group-delay' ? 'Group delay' : null;
    if (!view) continue;
    const key = `${source.row + 1}:${source.col + 1}`;
    const existing = state.selectedCellsByFamily[family][key] ?? [];
    if (!existing.includes(view)) state.selectedCellsByFamily[family][key] = [...existing,view];
  }
  return {...state,...file.touchstoneControls,activeViewByFamily:{...state.activeViewByFamily,...file.touchstoneControls?.activeViewByFamily},isExpanded:file.matrixOpen ?? state.isExpanded};
}

/** Clone a Touchstone selection state object. */
export function cloneTouchstoneSelectionState(state: TouchstoneSelectionState): TouchstoneSelectionState {
  const cloneFamilySelections = (source: Record<string, TouchstoneView[]>): Record<string, TouchstoneView[]> => {
    const result: Record<string, TouchstoneView[]> = {};
    Object.keys(source || {}).forEach((key) => {
      result[key] = [...(source[key] || [])];
    });
    return result;
  };

  return {
    ...state,
    activeViewByFamily: { ...state.activeViewByFamily },
    selectedCellsByFamily: {
      S: cloneFamilySelections(state.selectedCellsByFamily.S),
      Y: cloneFamilySelections(state.selectedCellsByFamily.Y),
      Z: cloneFamilySelections(state.selectedCellsByFamily.Z),
      ABCD: cloneFamilySelections(state.selectedCellsByFamily.ABCD),
    },
  };
}

export function appendTouchstoneDisplayTrace(
  file: RawFileRecord,
  selectionState: TouchstoneSelectionState,
  family: TouchstoneFamily,
  row: number,
  col: number,
  requestedView?: TouchstoneView,
): RawFileRecord {
  const datasetCache = new Map<TouchstoneFamily, NetworkDataset>();
  const sourceDataset = getSourceNetworkDataset(file);
  if (!sourceDataset) {
    return file;
  }
  datasetCache.set('S', sourceDataset);

  const dataset = getOrCreateDataset(file, family, datasetCache);
  if (!dataset) {
    return file;
  }

  const view = sanitizeView(family, requestedView ?? selectionState.activeViewByFamily[family]);
  const instanceKey = makeUniqueInstanceKey(file, family, row, col, view);
  const baseName = makeTouchstoneTraceBaseName(file, family, row, col, view);
  if ((view === 'VSWR' || view === 'Return loss') && (family !== 'S' || row !== col)) return file;
  const args = { row: row - 1, col: col - 1, label: `${family}${row}${col} ${view}`, legacyTraceName: `${baseName}__${instanceKey}`, legacyDisplayName: makeTouchstoneTraceLabel(file, family, row, col, view) };
  const nextTrace = view === 'Group delay'
    ? buildNetworkDerivedScalarTrace(dataset, { ...args, metric: 'group-delay', instanceKey })
    : buildNetworkProjectionDisplayTrace(dataset, { ...args, component: viewToComponent(view), instanceKey });
  if (!nextTrace) return file;
  const projection = view === 'Group delay' ? { ...nextTrace, kind: 'dataset-projection' as const } : nextTrace;

  const nextDisplayTraces = [...(file.displayTraces ?? []), projection];
  const datasets: Dataset[] = [sourceDataset, ...(['Y', 'Z', 'ABCD'] as const).flatMap((nextFamily) => {
    const cached = getOrCreateDataset(file, nextFamily, datasetCache);
    return cached && cached.id !== sourceDataset.id ? [cached] : [];
  })];

  return {
    ...file,
    datasets,
    displayTraces: nextDisplayTraces,
    traces: adaptDisplayTracesToLegacyTraces(datasets, nextDisplayTraces.filter((displayTrace) => !displayTrace.hidden), file),
  };
}

/** Reconcile datasets/display traces for a Touchstone file based on selections. */
export function reconcileTouchstoneFileSelections(file: RawFileRecord, selectionState: TouchstoneSelectionState): RawFileRecord {
  const sourceDataset = getSourceNetworkDataset(file);
  if (!sourceDataset) {
    return file;
  }

  const datasetCache = new Map<TouchstoneFamily, NetworkDataset>();
  datasetCache.set('S', sourceDataset);

  const nextDisplayTraces: DisplayTrace[] = [];
  const families: TouchstoneFamily[] = ['S', 'Y', 'Z', 'ABCD'];

  families.forEach((family) => {
    const familyCells = selectionState.selectedCellsByFamily[family] || {};
    Object.keys(familyCells).forEach((key) => {
      const [rowString, colString] = key.split(':');
      const row = Math.max(1, parseInt(rowString || '1', 10));
      const col = Math.max(1, parseInt(colString || '1', 10));
      const dataset = getOrCreateDataset(file, family, datasetCache);
      if (!dataset) {
        return;
      }

      (familyCells[key] || []).forEach((view) => {
        const safeView = sanitizeView(family, view);
        if ((safeView === 'VSWR' || safeView === 'Return loss') && (family !== 'S' || row !== col)) return;
        const args = { row: row - 1, col: col - 1, label: `${family}${row}${col} ${safeView}`, legacyTraceName: makeTouchstoneTraceBaseName(file, family, row, col, safeView), legacyDisplayName: makeTouchstoneTraceLabel(file, family, row, col, safeView) };
        const display = safeView === 'Group delay' ? buildNetworkDerivedScalarTrace(dataset, { ...args, metric: 'group-delay' }) : buildNetworkProjectionDisplayTrace(dataset, { ...args, component: viewToComponent(safeView) });
        if (display) nextDisplayTraces.push(safeView === 'Group delay' ? { ...display, kind: 'dataset-projection' } : display);
      });
    });
  });

  const datasets: Dataset[] = [sourceDataset, ...(['Y', 'Z', 'ABCD'] as const).flatMap((family) => {
    const dataset = datasetCache.get(family);
    return dataset && dataset.id !== sourceDataset.id ? [dataset] : [];
  })];
  const traces = adaptDisplayTracesToLegacyTraces(datasets, nextDisplayTraces, file);

  return {
    ...file,
    datasets,
    displayTraces: nextDisplayTraces,
    traces,
  };
}
