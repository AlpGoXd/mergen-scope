import { describe, expect, it } from "vitest";
import { computeBandwidth } from "../../src/domain/analysis/bandwidth";
import { computeChannelPower, computeOccupiedBandwidth } from "../../src/domain/analysis/channel-power";
import { tracesToCSV } from "../../src/domain/export";
import { getResolvedInterpolationStrategy, resolveValue } from "../../src/domain/interpolation";
import { findAbsoluteMax, findNextLocalExtremum, placeMarker } from "../../src/domain/markers";
import { canAssignTraceToPane } from "../../src/domain/pane-math";
import { computeHorizontalIntersections, computeVerticalIntersections } from "../../src/domain/ref-lines";
import { getVisibleTraceData, makeNiceTicks, sanitizeYDomain } from "../../src/domain/trace-math";
import { computeTwoPortStability } from "../../src/domain/touchstone-math";
import { makeTestTrace } from "./helpers";

describe("domain contracts", () => {
  it("interpolates visible edge points inside a zoom window", () => {
    const trace = makeTestTrace();

    expect(getVisibleTraceData(trace, { left: 5, right: 15 })).toEqual([
      { freq: 5, amp: 5 },
      { freq: 10, amp: 10 },
      { freq: 15, amp: 5 },
    ]);
  });

  it("resolves interpolation strategy and marker placement without chart dependencies", () => {
    const trace = makeTestTrace({ interpolation: "linear" });

    expect(getResolvedInterpolationStrategy("waveform", "sinc", false)).toBe("linear");
    expect(resolveValue(trace.data, 5, "linear", true)).toEqual({ x: 5, y: 5 });
    expect(placeMarker(trace, 5)).toMatchObject({ requestedFreq: 5, freq: 5, amp: 5, interpolated: true });
  });

  it("finds marker extrema and reference-line intersections", () => {
    const trace = makeTestTrace();

    expect(findAbsoluteMax(trace.data)).toEqual({ freq: 10, amp: 10 });
    expect(findNextLocalExtremum(trace.data, null, "right", "max")).toEqual({ freq: 10, amp: 10 });
    expect(computeVerticalIntersections(5, [trace], "pane-1")[0]).toMatchObject({ freq: 0, amp: 0 });
    expect(computeHorizontalIntersections(5, [trace], "pane-1")).toEqual([
      { traceName: trace.name, paneId: "pane-1", freq: 5, amp: 5 },
      { traceName: trace.name, paneId: "pane-1", freq: 15, amp: 5 },
    ]);
  });

  it("enforces pane domain compatibility", () => {
    const frequencyTrace = makeTestTrace({ name: "frequency-trace", domain: "frequency" });
    const timeTrace = makeTestTrace({ name: "time-trace", domain: "time", family: "waveform", units: { x: "s", y: "V" } });

    expect(canAssignTraceToPane(timeTrace, "pane-1", [frequencyTrace], { [frequencyTrace.name]: "pane-1" })).toMatchObject({
      allowed: false,
    });
    expect(canAssignTraceToPane(timeTrace, "pane-2", [frequencyTrace], { [frequencyTrace.name]: "pane-1" })).toEqual({
      allowed: true,
    });
  });

  it("computes analysis helpers on stable synthetic data", () => {
    const data = [
      { freq: 0, amp: -10 },
      { freq: 10, amp: 0 },
      { freq: 20, amp: -10 },
    ];

    expect(computeBandwidth(data, 10, 0, 3)).toMatchObject({ left: 7, right: 13, bandwidth: 6 });
    expect(computeOccupiedBandwidth(data, 99, "dBm")).toMatchObject({ supported: true });
    expect(computeChannelPower([
      { freq: 0, amp: -30 },
      { freq: 1000, amp: -30 },
    ], "dBm/Hz")).toMatchObject({ supported: true, powerDbm: 0 });
  });

  it("formats sparse trace grids and sanitizes numeric display helpers", () => {
    const a = makeTestTrace({ name: "a", dn: "A", data: [{ freq: 1, amp: 10 }, { freq: 2, amp: 20 }] });
    const b = makeTestTrace({ name: "b", dn: "B", data: [{ freq: 2, amp: 30 }, { freq: 3, amp: 40 }] });

    expect(tracesToCSV([a, b], "Frequency")).toBe("Frequency,A,B\n1,10,\n2,20,30\n3,,40");
    expect(sanitizeYDomain({ min: -1, max: 1 })).toEqual({ min: -1, max: 1 });
    expect(makeNiceTicks({ min: 0, max: 10 }, 6)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it("computes two-port stability factors for a simple stable network", () => {
    const stability = computeTwoPortStability([
      [{ re: 0.1, im: 0 }, { re: 0.01, im: 0 }],
      [{ re: 2, im: 0 }, { re: 0.1, im: 0 }],
    ]);

    expect(stability?.kFactor).toBeGreaterThan(1);
    expect(stability?.unconditional).toBe(true);
  });
});
