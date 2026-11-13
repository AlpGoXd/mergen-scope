import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildPanes } from "../../src/domain/pane-math";
import { buildExportPackage, buildSnapshot, restoreSnapshot } from "../../src/domain/workspace-serialize";
import { makeTestTrace } from "./helpers";
import { defaultPaneState, paneReducer } from '../../src/stores/pane-store';
import { initialWorkspaceState, snapshotFromWorkspace, workspaceFromSnapshot, workspaceReducer } from '../../src/stores/aggregate-workspace-store';
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

describe("workspace serialization", () => {
  it("round-trips a minimal static workspace snapshot", () => {
    const trace = makeTestTrace();
    const panes = buildPanes(1).map(pane => ({ ...pane, settings: { ...pane.settings, smith: { ...pane.settings.smith, range: { startHz: 2, stopHz: 5 }, outside: 'faint' as const } } }));
    const snapshot = buildSnapshot({
      files: [{
        id: "file-1",
        fileName: "fixture.dat",
        meta: {},
        traces: [trace],
        format: "rs-dat",
      }],
      datasets: [],
      displayTraces: [],
      derivedTraces: [],
      vis: { [trace.name]: true },
      paneMode: 1,
      panes,
      paneRenderModes: {},
      activePaneId: "pane-1",
      traceAssignments: { [trace.name]: "pane-1" },
      paneActiveTraceMap: { "pane-1": trace.name },
      xZoomState: { zoomAll: true, sharedZoom: null, paneXZooms: {} },
      yZoomState: { paneYZooms: {} },
      ui: {
        showSidebar: true,
        showDetailedFiles: true,
        showRightPanel: false,
        showDots: false,
        showMeta: true,
        showTouchstoneControls: false,
        showMarkers: true,
        showMarkerTools: true,
        showPaneTools: true,
        showSearchTools: true,
        showLineTools: true,
        showViewTools: true,
        theme: "dark",
        searchDirection: "right",
        newMarkerArmed: false,
        markerTrace: "__auto__",
        selectedMkrIdx: -1,
        dRef: null,
        refMode: null,
        selectedRefLineId: null,
        traceOpsOpenSections: { offset: false, scale: false, smoothing: false, subtract: false },
        noiseFilter: "gaussian",
        noiseSource: null,
        ip3Gain: "",
        dtTrace: null,
        traceColors: {},
        traceInterpolations: {},
      },
      markers: [{ trace: trace.name, requestedFreq: 10, freq: 10, amp: 10, type: "normal", label: null, refIdx: null, interpolated: false }],
      refLines: [{ id: 1, type: "v", value: 10, paneIds: ["pane-1"], label: "V1" }],
      savedNoise: [],
      savedIP3: [],
      analysisOpenState: {},
      selectedTraceName: trace.name,
    });

    const pkg = buildExportPackage(snapshot, "test");
    const restored = restoreSnapshot(JSON.stringify(pkg));

    expect(pkg.kind).toBe("mergen-scope-workspace");
    expect(restored?.files).toEqual(snapshot.files);
    expect(restored?.files[0]?.traces).toEqual(snapshot.files[0]?.traces);
    expect(restored?.datasets).toEqual(snapshot.datasets);
    expect(restored?.displayTraces).toEqual(snapshot.displayTraces);
    expect(restored?.markers).toHaveLength(1);
    expect(restored?.refLines).toHaveLength(1);
    expect(restored?.traceAssignments[trace.name]).toBe("pane-1");
    expect(restored?.panes[0]?.settings.smith.labels).toBe('normalised');
    expect(restored?.panes[0]?.settings.smith).toMatchObject({ range: { startHz: 2, stopHz: 5 }, outside: 'faint' });
  });

  it("restores duplicated v4 data and writes a substantially smaller snapshot", () => {
    const trace = { ...makeTestTrace(), data: Array.from({ length: 500 }, (_, i) => ({ freq: i * 1000, amp: i / 7 })) };
    const legacy = restoreSnapshot(JSON.stringify({ files: [{ id: "file-1", fileName: "sample.dat", meta: {}, traces: [trace] }] }));
    expect(legacy).not.toBeNull();
    if (!legacy) return;
    const file = legacy.files[0];
    expect(file).toBeDefined();
    if (!file) return;
    const duplicatedFile = { ...file, datasets: legacy.datasets, displayTraces: legacy.displayTraces };
    const duplicated = { ...legacy, files: [duplicatedFile] };
    const oldJson = JSON.stringify({ kind: "mergen-scope-workspace", snapshot: duplicated }, null, 2);
    const oldRestored = restoreSnapshot(oldJson);
    expect(oldRestored?.files).toEqual(duplicated.files);
    expect(oldRestored?.datasets).toEqual(duplicated.datasets);
    expect(oldRestored?.displayTraces).toEqual(duplicated.displayTraces);

    const json = JSON.stringify(buildExportPackage(duplicated, "test"));
    const restored = restoreSnapshot(json);
    expect(restored?.files).toEqual(duplicated.files);
    expect(restored?.datasets).toEqual(duplicated.datasets);
    expect(restored?.displayTraces).toEqual(duplicated.displayTraces);
    expect(json.length).toBeLessThan(oldJson.length / 2);
  });

  it("returns null for invalid workspace JSON instead of throwing", () => {
    expect(restoreSnapshot("{not json")).toBeNull();
  });
});


describe("legacy marker identifiers", () => {
  it("allocates missing IDs around explicit IDs before resolving index references", () => {
    const source = {version: 4, files: [], markers: [
      {id: "marker-2", type: "normal", trace: "a", freq: 1, amp: 2},
      {type: "delta", trace: "a", freq: 3, amp: 4, refIdx: 0},
    ]};
    const result = restoreSnapshot(JSON.stringify(source));
    expect(result?.markers.map(m => m.id)).toEqual(["marker-2", "marker-1"]);
    expect(result?.markers[1]?.refId).toBe("marker-2");
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
