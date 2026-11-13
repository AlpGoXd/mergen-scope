import { describe, expect, it } from "vitest";
import { normalizeTracePaneMap, buildPanes } from "../../src/domain/pane-math";
import { defaultPaneState, paneReducer } from "../../src/stores/pane-store";
import type { Trace } from "../../src/types/trace";
import { makeTestTrace } from "./helpers";

function trace(name: string, domain: "time" | "frequency"): Trace {
  return makeTestTrace({ name, domain });
}

describe("pane count changes", () => {
  it("moves traces of removed panes to a pane of the same domain", () => {
    const traces = [trace("spec", "frequency"), trace("wave", "time"), trace("wave2", "time")];
    const map = normalizeTracePaneMap(traces, { spec: "pane-1", wave: "pane-2", wave2: "pane-3" }, buildPanes(2));

    expect(map).toEqual({ spec: "pane-1", wave: "pane-2", wave2: "pane-2" });
  });

  it("falls back to the first pane only when no pane matches the domain", () => {
    const traces = [trace("spec", "frequency"), trace("wave", "time")];
    const map = normalizeTracePaneMap(traces, { spec: "pane-1", wave: "pane-3" }, buildPanes(1));

    expect(map).toEqual({ spec: "pane-1", wave: "pane-1" });
  });

  it("drops zooms of removed panes so a re-added pane starts fresh", () => {
    let state = paneReducer(defaultPaneState, { type: "SET_PANE_COUNT", payload: 3 });
    state = paneReducer(state, { type: "SET_PANE_ZOOM", payload: { paneId: "pane-3", zoom: { left: 1, right: 2 } } });
    state = paneReducer(state, { type: "SET_PANE_Y_ZOOM", payload: { paneId: "pane-3", zoom: { min: 0, max: 1 } } });

    const shrunk = paneReducer(state, { type: "SET_PANE_COUNT", payload: 2 });
    const regrown = paneReducer(shrunk, { type: "SET_PANE_COUNT", payload: 3 });

    expect(regrown.paneXZooms["pane-3"]).toBeUndefined();
    expect(regrown.paneYZooms["pane-3"]).toBeUndefined();
  });

  it("rebuilds the active trace map on reconcile after shrinking", () => {
    const traces = [trace("a", "frequency"), trace("b", "frequency")];
    let state = paneReducer(defaultPaneState, { type: "SET_PANE_COUNT", payload: 2 });
    state = paneReducer(state, { type: "RECONCILE", payload: traces });
    state = paneReducer(state, { type: "ASSIGN_TRACE_TO_PANE", payload: { trace: traces[1]!, targetPaneId: "pane-2", allTraces: traces } });

    const entries = traces.map(trace => ({trace, paneIds:state.tracePaneMap[trace.name] ?? []}));
    const shrunk = paneReducer(paneReducer(state, { type: "SET_PANE_COUNT", payload: 1, traces: entries }), { type: "RECONCILE", payload: traces });

    expect(shrunk.tracePaneMap).toEqual({ a: [], b: ["pane-1"] });
    expect(Object.keys(shrunk.paneActiveTraceMap)).toEqual(["pane-1"]);
  });
});
