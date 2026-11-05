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
    expect(restored?.files).toHaveLength(1);
    expect(restored?.markers).toHaveLength(1);
    expect(restored?.refLines).toHaveLength(1);
    expect(restored?.traceAssignments[trace.name]).toBe("pane-1");
  });

  it("returns null for invalid workspace JSON instead of throwing", () => {
    expect(restoreSnapshot("{not json")).toBeNull();
  });
});
