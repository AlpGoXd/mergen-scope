import type { RawFileRecord } from '../../types/file.ts';
import type { TouchstoneSelectionState, TouchstoneFamily, TouchstoneView } from '../../types/touchstone.ts';
import type { Dataset, NetworkDataset } from '../../types/dataset.ts';
import type { DisplayTrace } from '../../types/display.ts';
import { buildNetworkDatasetFromTouchstone, buildNetworkProjectionDisplayTrace, convertNetworkDataset } from '../dataset-builders.ts';
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

function viewToComponent(view: TouchstoneView): 'magnitude-db' | 'magnitude-linear' | 'phase' | 'real' | 'imag' {
  if (view === 'dB') return 'magnitude-db';
  if (view === 'Mag') return 'magnitude-linear';
  if (view === 'Phase') return 'phase';
  if (view === 'Real') return 'real';
  return 'imag';
}

function getAllowedViews(family: TouchstoneFamily): readonly TouchstoneView[] {
  return family === 'S'
    ? ['dB', 'Mag', 'Phase', 'Real', 'Imag']
    : ['Mag', 'Phase', 'Real', 'Imag'];
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
  return `${file.fileName.replace(/\.[^.]+$/, '')}_${family}${row}${col}_${view}`;
}

function makeUniqueInstanceKey(file: RawFileRecord, family: TouchstoneFamily, row: number, col: number, view: TouchstoneView): string {
  const baseName = makeTouchstoneTraceBaseName(file, family, row, col, view);
  const currentCount = (file.displayTraces ?? []).filter(
    (displayTrace) => (displayTrace.compat?.legacyTraceName ?? '').startsWith(baseName),
  ).length;
  return String(currentCount + 1);
}

/** Default selection state for a new Touchstone file. */
export function makeDefaultTouchstoneState(file: RawFileRecord): TouchstoneSelectionState {
  const portCount = file.touchstoneNetwork?.portCount ?? 0;
  const selectedCellsByFamily: Record<TouchstoneFamily, Record<string, TouchstoneView[]>> = {
    S: {}, Y: {}, Z: {}
  };

  if (portCount === 1) {
    selectedCellsByFamily.S['1:1'] = ['dB'];
  } else if (portCount === 2) {
    selectedCellsByFamily.S['1:1'] = ['dB'];
    selectedCellsByFamily.S['2:1'] = ['dB'];
  } else if (portCount > 2) {
    for (let i = 1; i <= portCount; i += 1) {
      selectedCellsByFamily.S[`${i}:${i}`] = ['dB'];
    }
  }

  return {
    activeFamily: 'S',
    isExpanded: true,
    activeViewByFamily: { S: 'dB', Y: 'Mag', Z: 'Mag' },
    selectedCellsByFamily,
  };
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
  const nextTrace = buildNetworkProjectionDisplayTrace(dataset, {
    row: row - 1,
    col: col - 1,
    component: viewToComponent(view),
    label: `${family}${row}${col} ${view}`,
    legacyTraceName: `${baseName}__${instanceKey}`,
    legacyDisplayName: makeTouchstoneTraceLabel(file, family, row, col, view),
    instanceKey,
  });

  const nextDisplayTraces = [...(file.displayTraces ?? []), nextTrace];
  const datasets: Dataset[] = [sourceDataset, ...(['Y', 'Z'] as const).flatMap((nextFamily) => {
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
  const families: TouchstoneFamily[] = ['S', 'Y', 'Z'];

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
        nextDisplayTraces.push(buildNetworkProjectionDisplayTrace(dataset, {
          row: row - 1,
          col: col - 1,
          component: viewToComponent(safeView),
          label: `${family}${row}${col} ${safeView}`,
          legacyTraceName: makeTouchstoneTraceBaseName(file, family, row, col, safeView),
          legacyDisplayName: makeTouchstoneTraceLabel(file, family, row, col, safeView),
        }));
      });
    });
  });

  const datasets: Dataset[] = [sourceDataset, ...(['Y', 'Z'] as const).flatMap((family) => {
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
