// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { buildScalarDisplayTraceFromSeriesDataset, buildSeriesDatasetFromTrace } from "../../src/domain/dataset-builders";
import { useWorkspaceV5 } from "../../src/hooks/use-workspace-v5";
import { StoreRoot } from "../../src/stores/StoreRoot";
import type { WorkspaceSnapshotV5 } from "../../src/types/workspace-v5";
import { makeTestTrace } from "./helpers";
import { defaultPaneState, paneReducer } from '../../src/stores/pane-store';
import { initialWorkspaceState, snapshotFromWorkspace, traceView, useAggregateWorkspace, workspaceFromSnapshot, workspaceReducer } from '../../src/stores/aggregate-workspace-store';
import { migrateWorkspaceV5 } from '../../src/domain/workspace-migrate-v5';

it('round trips saved layout sizes and defaults old layouts', () => {
  const state = initialWorkspaceState();
  const sizes = { 'rows:0': 0.6, 'columns:0': 0.4 };
  const snapshot = snapshotFromWorkspace({ ...state, layout: { ...state.layout, sizes } });
  expect(snapshot?.layout.sizes).toEqual(sizes);
  expect(migrateWorkspaceV5(snapshot)?.layout.sizes).toEqual(sizes);
  expect(snapshotFromWorkspace(state)?.layout).toMatchObject({ preset: 'rows', sizes: {} });
});

it('new panes copy outside choice but reset the Smith range', () => {
  const pane = defaultPaneState.panes[0];
  if (!pane) throw new Error('pane');
  const state = { ...defaultPaneState, panes: [{ ...pane, settings: { ...pane.settings, smith: { ...pane.settings.smith, range: { startHz: 2, stopHz: 5 }, outside: 'faint' as const } } }] };
  expect(paneReducer(state, { type: 'SET_PANE_COUNT', payload: 2 }).panes[1]?.settings.smith).toMatchObject({ range: null, outside: 'faint' });
});

async function downloadWorkspace(snapshot: WorkspaceSnapshotV5): Promise<string> {
  const { result, unmount } = renderHook(useWorkspaceV5, { wrapper: StoreRoot });
  let download: Blob | undefined;
  const createUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    download = blob;
    return 'blob:workspace-test';
  });
  const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  try {
    act(() => result.current.restore(snapshot));
    result.current.downloadWorkspace();
    if (!download) throw new Error('Expected a workspace download');
    const blob = download;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
  } finally {
    click.mockRestore();
    revokeUrl.mockRestore();
    createUrl.mockRestore();
    unmount();
  }
}

describe("workspace serialization", () => {
  it.each([
    ['legacy grid disabled', { showGrid: false }, undefined, false],
    ['explicit major grid enabled', { showGrid: false }, { gridMajor: true }, true],
    ['grid defaults', {}, undefined, true],
  ])('restores %s via the v4 loader', (_label, legacy, settings, expected) => {
    const snapshot = { version: 4, files: [], panes: [{ id: 'pane-1', ...legacy, settings }] };
    const migrated = migrateWorkspaceV5(JSON.parse(JSON.stringify(snapshot)));
    if (!migrated) throw new Error('Expected a migrated v4 workspace');
    const restored = workspaceFromSnapshot(initialWorkspaceState(), migrated, true);
    expect(restored?.panes.panes[0]?.settings.gridMajor).toBe(expected);
    expect(restored?.panes.panes[0]).not.toHaveProperty('showGrid');
  });

  it("round-trips a minimal static workspace snapshot", async () => {
    const trace = makeTestTrace();
    const state = initialWorkspaceState();
    const pane = state.panes.panes[0];
    if (!pane) throw new Error('Expected a pane');
    const smith = { ...pane.settings.smith, range: { startHz: 2, stopHz: 5 }, outside: 'faint' as const };
    const snapshot = snapshotFromWorkspace({
      ...state,
      files: {
        ...state.files,
        files: [{ id: 'file-1', fileName: 'fixture.dat', meta: {}, traces: [trace], format: 'rs-dat' }],
      },
      traces: { ...state.traces, vis: { [trace.name]: true } },
      panes: {
        ...state.panes,
        panes: [{ ...pane, settings: { ...pane.settings, smith } }],
        tracePaneMap: { [trace.name]: [pane.id] },
        paneActiveTraceMap: { [pane.id]: trace.name },
      },
      markers: {
        ...state.markers,
        markers: [{ id: 'marker-1', trace: trace.name, requestedFreq: 10, freq: 10, amp: 10, type: 'normal', label: null, refId: null, interpolated: false }],
      },
      lines: {
        ...state.lines,
        refLines: [{ id: 1, type: 'v', value: 10, paneIds: [pane.id], label: 'V1' }],
      },
      ui: { ...state.ui, selectedTraceName: trace.name },
    });
    if (!snapshot) throw new Error('Expected a saved workspace');

    const pkg = JSON.parse(await downloadWorkspace(snapshot));
    const reloaded = migrateWorkspaceV5(pkg);
    if (!reloaded) throw new Error('Expected a migrated workspace download');
    const restored = workspaceFromSnapshot(initialWorkspaceState(), reloaded);
    if (!restored) throw new Error('Expected a restored workspace');

    const view = traceView(restored.files, restored.traces);
    expect(pkg.kind).toBe("mergen-scope-workspace");
    expect(restored.files.files).toEqual(snapshot.files);
    expect(restored.files.files[0]?.traces).toEqual(snapshot.files[0]?.traces);
    expect(view.allDatasets).toEqual(snapshot.datasets);
    expect(view.allDisplayTraces).toEqual(snapshot.displayTraces);
    expect(restored.markers.markers).toHaveLength(1);
    expect(restored.lines.refLines).toHaveLength(1);
    expect(restored.panes.tracePaneMap[trace.name]).toEqual(["pane-1"]);
    expect(restored.panes.panes[0]?.settings.smith.labels).toBe('normalised');
    expect(restored.panes.panes[0]?.settings.smith).toMatchObject({ range: { startHz: 2, stopHz: 5 }, outside: 'faint' });
  });

  it("restores duplicated v4 data and writes a substantially smaller snapshot", async () => {
    const trace = { ...makeTestTrace(), data: Array.from({ length: 500 }, (_, i) => ({ freq: i * 1000, amp: i / 7 })) };
    const dataset = buildSeriesDatasetFromTrace(trace, 'spectrum', 'file-1', 'sample.dat');
    const series = dataset.series[0];
    if (!series) throw new Error('Expected a source series');
    const legacyDataset = { ...dataset, series: [{ ...series, id: trace.id }] };
    const display = { ...buildScalarDisplayTraceFromSeriesDataset(dataset, { ...series, id: trace.id }, trace), id: trace.id };
    const datasets = [legacyDataset];
    const displayTraces = [display];
    const files = [{ id: 'file-1', fileName: 'sample.dat', meta: {}, traces: [trace], datasets, displayTraces }];
    const legacy = { version: 4, files, datasets, displayTraces };
    const oldJson = JSON.stringify({ kind: "mergen-scope-workspace", snapshot: legacy }, null, 2);
    const oldRestored = migrateWorkspaceV5(JSON.parse(oldJson));
    expect(oldRestored?.files).toEqual(files);
    expect(oldRestored?.datasets).toEqual(datasets);
    expect(oldRestored?.displayTraces).toEqual(displayTraces);
    if (!oldRestored) throw new Error('Expected a migrated v4 workspace');

    const json = await downloadWorkspace(oldRestored);
    const restored = migrateWorkspaceV5(JSON.parse(json));
    expect(restored?.files).toEqual(files);
    expect(restored?.datasets).toEqual(datasets);
    expect(restored?.displayTraces).toEqual(displayTraces);
    expect(json.length).toBeLessThan(oldJson.length / 2);
  });

  it("rejects malformed workspace JSON without changing the open workspace", async () => {
    const { result } = renderHook(() => ({
      loadFromFile: useWorkspaceV5().loadFromFile,
      workspace: useAggregateWorkspace(),
    }), { wrapper: StoreRoot });
    const trace = makeTestTrace();
    act(() => result.current.workspace.dispatch({
      slice: 'files',
      action: {
        type: 'ADD_PARSED_FILE',
        payload: { id: 'file-1', fileName: 'fixture.dat', text: '', parsed: { format: 'rs-dat', meta: {}, traces: [trace] } },
      },
    }));
    const before = result.current.workspace.state.files.files;
    expect(before).toHaveLength(1);

    const file = new File(['{not json'], 'broken.json');
    Object.defineProperty(file, 'text', { value: async () => '{not json' });
    await act(async () => result.current.loadFromFile(file));

    expect(result.current.workspace.state.files.importErrors).toContainEqual(expect.objectContaining({
      fileName: 'broken.json',
      message: 'Not a valid workspace. The current workspace was left unchanged.',
    }));
    expect(result.current.workspace.state.files.files).toEqual(before);
  });
});


describe("legacy marker identifiers", () => {
  it("allocates missing IDs around explicit IDs before resolving index references", () => {
    const source = {version: 4, files: [{ id: "file-1", fileName: "fixture.dat", meta: {}, traces: [makeTestTrace({ name: "a" })] }], markers: [
      {id: "marker-2", type: "normal", trace: "a", freq: 1, amp: 2},
      {type: "delta", trace: "a", freq: 3, amp: 4, refIdx: 0},
    ]};
    const migrated = migrateWorkspaceV5(JSON.parse(JSON.stringify(source)));
    if (!migrated) throw new Error('Expected a migrated v4 workspace');
    const result = workspaceFromSnapshot(initialWorkspaceState(), migrated, true);
    expect(result?.markers.markers.map(m => m.id)).toEqual(["marker-2", "marker-1"]);
    expect(result?.markers.markers[1]?.refId).toBe("marker-2");
  });
});

describe('X link groups in saved workspaces', () => {
  const eightPanes = (): Record<string, unknown> => JSON.parse(readFileSync('tests/fixtures/phase3-preservation/workspace-v4-eight-pane-extension.json', 'utf8'));
  const groups = (snapshot: ReturnType<typeof migrateWorkspaceV5>) => Object.fromEntries((snapshot?.panes ?? []).map(pane => [pane.id, pane.xLinkGroup]));

  it('turns the old automatic linking into one group per X unit, with the old shared zoom', () => {
    // Panes a and b show Hz, h shows s (the only one), the rest are empty.
    const raw = { ...eightPanes(), xZoomState: { zoomAll: true, sharedZoom: { left: 1e6, right: 2e6 }, paneXZooms: { 'pane-a': { left: 5, right: 6 } } } };
    const migrated = migrateWorkspaceV5(raw);
    expect(migrated).not.toBeNull();
    const ids = groups(migrated);
    expect(ids['pane-a']).toBeTruthy();
    expect(ids['pane-b']).toBe(ids['pane-a']);
    expect(ids['pane-h']).toBeNull();
    expect(Object.entries(ids).filter(([id]) => !['pane-a', 'pane-b'].includes(id)).every(([, group]) => group === null)).toBe(true);
    expect(migrated?.xZoomState.zoomAll).toBe(false);
    expect(migrated?.xZoomState.sharedZoom).toBeNull();
    // Every pane shows what it showed before: the shared window replaced the per-pane ones.
    expect(migrated?.xZoomState.paneXZooms['pane-a']).toEqual({ left: 1e6, right: 2e6 });
    expect(migrated?.xZoomState.paneXZooms['pane-b']).toEqual({ left: 1e6, right: 2e6 });
    // Loading the migrated workspace again changes nothing.
    expect(groups(migrateWorkspaceV5(migrated))).toEqual(ids);
  });

  it('keeps unlinked old workspaces unlinked and saves groups from the live state', () => {
    expect(Object.values(groups(migrateWorkspaceV5(eightPanes()))).every(group => group === null)).toBe(true);
    const state = initialWorkspaceState();
    const pane = state.panes.panes[0];
    if (!pane) throw new Error('pane');
    const panes = [{ ...pane, xLinkGroup: 'x1' }, { ...pane, id: 'pane-2', title: 'Pane 2', xLinkGroup: 'x1' }];
    const snapshot = snapshotFromWorkspace({ ...state, panes: { ...state.panes, panes, paneActiveTraceMap: { 'pane-1': null, 'pane-2': null } }, layout: { ...state.layout, paneOrder: ['pane-1', 'pane-2'] } });
    expect(snapshot?.xZoomState.zoomAll).toBe(false);
    expect(groups(snapshot)).toEqual({ 'pane-1': 'x1', 'pane-2': 'x1' });
    expect(groups(migrateWorkspaceV5(snapshot))).toEqual({ 'pane-1': 'x1', 'pane-2': 'x1' });
  });
});

describe('table pane settings', () => {
  const twoPanes = () => {
    let state = initialWorkspaceState();
    state = workspaceReducer(state, { slice: 'panes', limit: 4, action: { type: 'SET_PANE_COUNT', payload: 2 } });
    state = workspaceReducer(state, { slice: 'panes', limit: 4, action: { type: 'SET_RENDER_MODE', payload: { paneId: 'pane-2', mode: 'table', traces: [] } } });
    return workspaceReducer(state, { slice: 'panes', limit: 4, action: { type: 'SET_PANE_SETTINGS', payload: { paneId: 'pane-2', patch: { table: { range: 'visible' } } } } });
  };
  it('saves Range and restores it', () => {
    const snapshot = snapshotFromWorkspace(twoPanes());
    if (!snapshot) throw new Error('snapshot');
    expect(snapshot.panes.find(pane => pane.id === 'pane-2')?.settings.table).toEqual({ range: 'visible' });
    const reloaded = migrateWorkspaceV5(JSON.parse(JSON.stringify(snapshot)));
    if (!reloaded) throw new Error('migration');
    const restored = workspaceFromSnapshot(initialWorkspaceState(), reloaded);
    const table = restored?.panes.panes.find(pane => pane.id === 'pane-2');
    expect(table?.renderMode).toBe('table');
    expect(table?.settings.table).toEqual({ range: 'visible' });
    expect(restored?.panes.panes.find(pane => pane.id === 'pane-1')?.settings.table).toBeUndefined();
  });
  it('drops Rows and Follow from first-build saves and refuses an unknown range', () => {
    const snapshot = snapshotFromWorkspace(twoPanes());
    if (!snapshot) throw new Error('snapshot');
    const withTable = (table: unknown) => ({ ...snapshot, panes: snapshot.panes.map(pane => pane.id === 'pane-2' ? { ...pane, settings: { ...pane.settings, table } } : pane) });
    const tableOf = (raw: unknown) => migrateWorkspaceV5(raw)?.panes.find(pane => pane.id === 'pane-2')?.settings.table;
    expect(tableOf(withTable({ rows: 'near', range: 'all', follow: 'pane-1' }))).toEqual({ range: 'all' });
    expect(tableOf({ ...withTable({ rows: 'all', range: 'visible', follow: 'gone' }), version: 4 })).toEqual({ range: 'visible' });
    expect(tableOf(withTable(undefined))).toBeUndefined();
    expect(migrateWorkspaceV5(withTable({ range: 'everything' }))).toBeNull();
    expect(migrateWorkspaceV5(withTable('pane-1'))).toBeNull();
  });
  it('new panes do not copy the Table settings', () => {
    const state = twoPanes();
    const next = workspaceReducer({ ...state, panes: { ...state.panes, activePaneId: 'pane-2' } }, { slice: 'panes', limit: 4, action: { type: 'SET_PANE_COUNT', payload: 3 } });
    expect(next.panes.panes.find(pane => pane.id === 'pane-3')?.settings.table).toBeUndefined();
  });
});
