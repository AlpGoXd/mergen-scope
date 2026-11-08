import { describe, expect, it } from "vitest";
import { buildPanes } from "../../src/domain/pane-math";
import { buildExportPackage, buildSnapshot, restoreSnapshot } from "../../src/domain/workspace-serialize";
import { makeTestTrace } from "./helpers";

describe("workspace serialization", () => {
  it("round-trips a minimal static workspace snapshot", () => {
    const trace = makeTestTrace();
    const panes = buildPanes(1);
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
        showTraceOps: false,
        showAnalysisPanel: false,
        showImportExportPanel: false,
        showMarkers: true,
        showMarkerTools: true,
        showPaneTools: true,
        showSearchTools: true,
        showLineTools: true,
        showViewTools: true,
        showDT: false,
        theme: "dark",
        lockLinesAcrossPanes: false,
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
      refLines: [{ id: 1, type: "v", value: 10, paneId: "pane-1", groupId: null, label: "V1" }],
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
