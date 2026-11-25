import { describe, expect, it } from "vitest";
import { computeBandwidth } from "../../src/domain/analysis/bandwidth";
import { buildPeakSpurTable, computeRangeStats, sliceTraceToRange } from "../../src/domain/analysis/range-stats";
import {
  computeGroupDelay,
  computeReciprocityIsolation,
  computeReturnLoss,
  computeStabilityFactors,
  computeVSWR,
} from "../../src/domain/analysis/touchstone";
import {
  buildExtrema,
  cloneMarkerWithoutIP3Label,
  findAbsoluteMax,
  findAbsoluteMin,
  findHighestPeakExcluding,
  findNextLocalExtremum,
  findPeakNearFreq,
  getIP3PointsFromMarkers,
  isIP3Label,
  isLocalExtremum,
  nearestIndexByFreq,
  placeMarker,
} from "../../src/domain/markers";
import type { PlacementPane, PlacementTrace } from "../../src/domain/pane-placement";
import { parseTabularFile, summarizeTabularPreview } from "../../src/domain/parsers/tabular";
import { parseTouchstoneFile } from "../../src/domain/parsers/touchstone";
import {
  addLinePane,
  canSetLinePanes,
  computeHorizontalIntersections,
  computeLineIntersections,
  computeVerticalIntersections,
  linePaneXGroup,
  nextLineLabel,
  removeLinePane,
  setLinePanes,
} from "../../src/domain/ref-lines";
import {
  decimateMinMax,
  findHorizontalCrossings,
  getSafeYRangeFromData,
  getVisibleTraceData,
  interpolatePointAtX,
  makeNiceTicks,
  nearestNiceStepIndex,
  niceStepAtIndex,
  normalizeTraceData,
  sanitizeYDomain,
  steppedSpan,
  traceBound,
} from "../../src/domain/trace-math";
import type { TouchstoneContext } from "../../src/types/analysis";
import type { WizardConfig } from "../../src/types/file";
import type { InterpolationStrategy } from "../../src/types/interpolation";
import type { Marker } from "../../src/types/marker";
import { defaultPaneSettings } from "../../src/types/pane";
import type { RefLine } from "../../src/types/ref-line";
import type { ComplexMatrix, TouchstoneSample } from "../../src/types/touchstone";
import type { DataPoint, Trace } from "../../src/types/trace";

const precision = 12;
type Sample = readonly [freq: number, amp: number];
const samples = (pairs: readonly Sample[]): DataPoint[] => pairs.map(([freq, amp]) => ({ freq, amp }));

function trace(name: string, pairs: readonly Sample[], interpolation: InterpolationStrategy = "linear", x = "Hz"): Trace {
  return {
    id: name,
    kind: "raw",
    sourceTraceIds: [name],
    operationType: null,
    parameters: null,
    units: { x, y: "dB" },
    paneId: null,
    name,
    mode: "",
    detector: "",
    family: "waveform",
    domain: "frequency",
    data: samples(pairs),
    file: "samples.csv",
    dn: name,
    isUniform: true,
    interpolation,
  };
}

function expectPoint(point: DataPoint | null | undefined, [freq, amp]: Sample): void {
  expect(point?.freq).toBeCloseTo(freq, precision);
  expect(point?.amp).toBeCloseTo(amp, precision);
}

function expectPoints(points: readonly DataPoint[] | undefined, pairs: readonly Sample[]): void {
  expect(points).toHaveLength(pairs.length);
  pairs.forEach((pair, index) => expectPoint(points?.[index], pair));
}

function expectNumbers(actual: readonly number[] | undefined, expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => expect(actual?.[index]).toBeCloseTo(value, precision));
}

const ri = (re: number, im = 0) => ({ re, im });
const networkSample = (freq: number, sMatrix: ComplexMatrix): TouchstoneSample => ({ freq, sMatrix });

function context(portCount: number, data: readonly TouchstoneSample[], row: number | null = 0, col = 0): TouchstoneContext {
  const referenceOhms = Array.from({ length: portCount }, () => 50);
  return {
    isTouchstone: true, fileId: null, fileName: null, parameterType: "S", portCount,
    family: "network", view: "magnitude", row, col, metric: null, referenceOhms,
    freqUnit: "Hz", dataFormat: "RI", comments: [], samples: data, source: null, traceLabel: "S",
    network: {
      parameterType: "S", portCount, referenceOhms, freqUnit: "Hz", dataFormat: "RI",
      comments: [], samples: data, matrixFormat: "full", version: 1,
    },
  };
}

const inBand = trace("band", [[0, -9], [1, -6], [2, 0], [3, -3], [4, -9]]);
const curvePairs: Sample[] = [[0, 2], [1, 9], [2, 3], [3, 8], [4, 5]];
const twoPort = context(2, [
  networkSample(10, [[ri(0.1, 0.2), ri(0.05, -0.01)], [ri(0.7, 0.2), ri(-0.3, 0.1)]]),
  networkSample(20, [[ri(0.5), ri(0)], [ri(0.5), ri(0)]]),
  networkSample(30, [[ri(2), ri(0.1)], [ri(1), ri(0)]]),
]);
const wrapped = context(1, [
  networkSample(10, [[ri(0, -1)]]), networkSample(20, [[ri(-1, -1)]]),
  networkSample(30, [[ri(-1, 1)]]), networkSample(50, [[ri(0, 1)]]),
]);
const tabularText = "Time (ms);Amp (mV);CH2\n3;30;NaN\n1;10;7\n1;11;\n2;Infinity;8\n;400;90\nInfinity;200;5\n4;40";
const wizard: WizardConfig = {
  delimiter: ";", skipRows: 1.9, xCol: 0, yCols: [2, 1, 8], xMult: 0.001, yMult: 0.5,
  xUnit: "ms", domain: "time", confidence: 1, headers: ["stale", "old", "other"],
};

describe("trace math", () => {
  it("interpolates, extrapolates, uses the second amplitude for duplicate X, and rejects non-finite input", () => {
    const a = { freq: 1, amp: 2 };
    const b = { freq: 3, amp: 5 };
    expectPoint(interpolatePointAtX(a, b, 1.5), [1.5, 2.75]);
    expectPoint(interpolatePointAtX(b, a, 4), [4, 6.5]);
    expectPoint(interpolatePointAtX(a, { ...b, freq: 1 }, 7), [7, 5]);
    expect(interpolatePointAtX(null, b, 2)).toBeNull();
    expect(interpolatePointAtX(a, b, Infinity)).toBeNull();
    expect(interpolatePointAtX(a, { ...b, amp: NaN }, 2)).toBeNull();
  });

  it("finds lower and upper sorted bounds including duplicate and out-of-range X", () => {
    const data = samples([[1, 2], [2, 3], [2, 4], [4, 5]]);
    expect(traceBound([], 2)).toBe(0);
    expect(traceBound(samples([[1, 3]]), 1, true)).toBe(1);
    expect(traceBound(data, 2)).toBe(1);
    expect(traceBound(data, 2, true)).toBe(3);
    expect(traceBound(data, 3)).toBe(3);
    expect(traceBound(data, -1)).toBe(0);
    expect(traceBound(data, 5, true)).toBe(4);
  });

  it("retains bucket extrema, bounds, and neighboring samples in original order", () => {
    const data = samples([[0, 0], [1, 2], [2, 9], [3, -3], [4, 6], [5, -8], [6, 1], [7, 3], [8, 0]]);
    expectPoints(decimateMinMax(data, 1, 7, 2), [[0, 0], [1, 2], [2, 9], [3, -3], [4, 6], [5, -8], [7, 3], [8, 0]]);
    expectPoints(decimateMinMax(data, 2, 3, 2), [[1, 2], [2, 9], [3, -3], [4, 6]]);
    expectPoints(decimateMinMax(data, 9, 10, NaN), [[8, 0]]);
    expectPoints(decimateMinMax(samples([[1, 5], [1, 9], [1, 2], [1, 8]]), 1, 1, 0), [[1, 5], [1, 9], [1, 2], [1, 8]]);
    expect(decimateMinMax([], 0, 1, 1)).toEqual([]);
    expect(decimateMinMax(data, 2, 1, 1)).toEqual([]);
  });

  it("clips at both edges and interpolates a zoom wholly inside a two-point segment", () => {
    expectPoints(getVisibleTraceData(inBand, { left: 1.25, right: 3.25 }), [[1.25, -4.5], [2, 0], [3, -3], [3.25, -4.5]]);
    expectPoints(getVisibleTraceData(trace("pair", [[0, 2], [8, 6]]), { left: 1, right: 3 }), [[1, 2.5], [3, 3.5]]);
    expectPoints(getVisibleTraceData(trace("single", [[2, 4]]), { left: 1, right: 3 }), [[2, 4]]);
    expect(getVisibleTraceData(inBand, { left: 9, right: 10 })).toEqual([]);
    expect(getVisibleTraceData(inBand, { left: NaN, right: 1 })).toBe(inBand.data);
    expect(getVisibleTraceData(null, null)).toEqual([]);
    const dirty = trace("dirty", [[0, 0], [1, NaN], [2, 4], [Infinity, 5], [3, 6]]);
    expectPoints(getVisibleTraceData(dirty, { left: 0.5, right: 2.5 }), [[2, 4]]);
  });

  it("pads visible Y ranges, clamps large values, and expands a singleton", () => {
    const normal = getSafeYRangeFromData([inBand], { band: true }, null);
    expect(normal?.min).toBeCloseTo(-9.72, precision);
    expect(normal?.max).toBeCloseTo(0.72, precision);
    const single = trace("single", [[3, 5]]);
    const singleton = getSafeYRangeFromData([single], { single: true }, null);
    expect(singleton?.min).toBeCloseTo(4.849, precision);
    expect(singleton?.max).toBeCloseTo(5.151, precision);
    const dirty = trace("dirty", [[0, -999], [1, NaN], [2, Infinity], [3, 999]]);
    expect(getSafeYRangeFromData([dirty], { dirty: true }, null)).toEqual({ min: -300, max: 300 });
    expect(getSafeYRangeFromData([inBand], {}, null)).toBeNull();
    expect(getSafeYRangeFromData([], {}, null)).toBeNull();
  });

  it("sanitizes domains and produces rounded ticks or the two-endpoint fallback", () => {
    expect(sanitizeYDomain({ min: -400, max: 450 })).toEqual({ min: -300, max: 300 });
    expect(sanitizeYDomain({ min: 0, max: 1e-16 })).toBeNull();
    expect(sanitizeYDomain({ min: 2, max: 1 })).toBeNull();
    expect(sanitizeYDomain({ min: 0, max: Infinity })).toBeNull();
    expect(sanitizeYDomain(null)).toBeNull();
    expectNumbers(makeNiceTicks({ min: -0.03, max: 0.10 }, 5), [0, 0.05, 0.1]);
    expectNumbers(makeNiceTicks({ min: 0.12, max: 0.13 }, 2), [0.12, 0.13]);
    expect(makeNiceTicks({ min: 1, max: 1 })).toBeUndefined();
    expect(makeNiceTicks(null)).toBeUndefined();
  });

  it("snaps to 1-2-5 steps across decades and preserves invalid spans", () => {
    expectNumbers([-4, -3, -2, -1, 0, 1, 2, 3].map(niceStepAtIndex), [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10]);
    expect(niceStepAtIndex(0.5)).toBeNaN();
    expect(niceStepAtIndex(Infinity)).toBeNaN();
    expect(nearestNiceStepIndex(0.041)).toBe(-4);
    expect(nearestNiceStepIndex(3.5)).toBe(2);
    expect(nearestNiceStepIndex(0)).toBe(0);
    expect(nearestNiceStepIndex(NaN)).toBe(0);
    expect(steppedSpan(12, 1)).toBeCloseTo(30, precision);
    expect(steppedSpan(12, -1)).toBeCloseTo(6, precision);
    expect(steppedSpan(11, 1)).toBeCloseTo(12, precision);
    expect(steppedSpan(13, -1)).toBeCloseTo(12, precision);
    expect(steppedSpan(10, 1, 3)).toBeCloseTo(20, precision);
    expect(steppedSpan(-1, -1)).toBe(-1);
    expect(steppedSpan(Infinity, 1)).toBe(Infinity);
  });

  it("finds crossings and exact hits, deduplicating repeated X after filtering non-finite points", () => {
    const signal = trace("signal", [[0, -3], [2, 1], [2, 0], [2, 0], [3, Infinity], [4, -4], [6, 4]]);
    expectNumbers(findHorizontalCrossings(signal, 0, null), [1.5, 2, 5]);
    expectNumbers(findHorizontalCrossings(signal, 0, { left: 1, right: 3 }), [1.5, 2]);
    expect(findHorizontalCrossings(trace("single", [[0, 0]]), 0, null)).toEqual([]);
    expect(findHorizontalCrossings(signal, NaN, null)).toEqual([]);
    expect(findHorizontalCrossings(null, 0, null)).toEqual([]);
  });

  it("sorts finite samples and keeps the last value for each X", () => {
    const data = samples([[3, 9], [2, 7], [3, 4], [Infinity, 6], [1, NaN], [0, -1]]);
    expectPoints(normalizeTraceData(data), [[0, -1], [2, 7], [3, 4]]);
    expectPoints(normalizeTraceData(samples([[4, 1]])), [[4, 1]]);
    expect(normalizeTraceData([])).toEqual([]);
  });
});

describe("Touchstone analysis", () => {
  type ScalarResult = { readonly freq: number; readonly value: number };
  const expectScalar = (result: ScalarResult | undefined, freq: number, value: number) => {
    expect(result?.freq).toBe(freq);
    expect(result?.value).toBeCloseTo(value, precision);
  };

  it("summarizes VSWR and clamps reflection magnitude above one", () => {
    const result = computeVSWR(twoPort);
    expect(result?.count).toBe(3);
    expectScalar(result?.min, 10, 1.5760143110525873);
    expectScalar(result?.max, 30, 1999999999999);
    expect(result?.average).toBeCloseTo(666666666667.8586, precision);
    const single = computeVSWR(context(1, [networkSample(2, [[ri(0.25)]])]));
    expectScalar(single?.min, 2, 1.6666666666666667);
    expectScalar(single?.max, 2, 1.6666666666666667);
    expect(single?.count).toBe(1);
    expect(computeVSWR(context(1, []))).toBeNull();
    expect(computeVSWR(context(1, [networkSample(2, [[ri(0)]])], null))).toBeNull();
  });

  it("summarizes return loss, floors a zero reflection, and skips missing cells", () => {
    const result = computeReturnLoss(twoPort);
    expect(result?.count).toBe(3);
    expectScalar(result?.min, 30, -6.020599913279624);
    expectScalar(result?.max, 10, 13.01029995663981);
    expect(result?.average).toBeCloseTo(4.33676665221327, precision);
    const single = computeReturnLoss(context(1, [networkSample(1, []), networkSample(2, [[ri(0)]])]));
    expect(single).toEqual({ min: { freq: 2, value: 300 }, max: { freq: 2, value: 300 }, average: 300, count: 1 });
    expect(computeReturnLoss(null)).toBeNull();
  });

  it("unwraps phase and uses central differences, skipping invalid and repeated frequency spans", () => {
    const result = computeGroupDelay(wrapped);
    expect(result?.count).toBe(2);
    expectScalar(result?.min, 30, 0.0125);
    expectScalar(result?.max, 20, 0.01875);
    expect(result?.average).toBeCloseTo(0.015625, precision);
    const reversed = computeGroupDelay(context(1, [
      networkSample(10, [[ri(0, 1)]]), networkSample(20, [[ri(-1, 1)]]), networkSample(30, [[ri(-1, -1)]]),
    ]));
    expectScalar(reversed?.min, 20, -0.01875);
    expect(computeGroupDelay(context(1, wrapped.network?.samples.slice(0, 2) ?? []))).toBeNull();
    expect(computeGroupDelay(context(1, [
      networkSample(5, [[ri(1)]]), networkSample(7, [[ri(0, 1)]]), networkSample(5, [[ri(-1)]]),
    ]))).toBeNull();
    expect(computeGroupDelay(context(1, [
      networkSample(5, [[ri(1)]]), networkSample(7, [[ri(0, 1)]]), networkSample(Infinity, [[ri(-1)]]),
    ]))).toBeNull();
  });

  it("summarizes reciprocal error and isolation for two ports", () => {
    const result = computeReciprocityIsolation(twoPort);
    expect(result?.count).toBe(3);
    expectScalar(result?.reciprocityError, 20, 293.9794000867204);
    expectScalar(result?.worstIsolationDb, 30, 0);
    expect(result?.worstIsolationDb.value).toBe(-0);
    expect(result?.averageReciprocityErrorDb).toBeCloseTo(112.35747510100668, precision);
    expect(computeReciprocityIsolation(wrapped)).toBeNull();
    expect(computeReciprocityIsolation(context(2, []))).toBeNull();
  });

  it("records stability minima, delta extrema, and the number of unstable samples", () => {
    const result = computeStabilityFactors(twoPort);
    expect(result?.count).toBe(3);
    expect(result?.unstableCount).toBe(1);
    expectScalar(result?.minK, 30, -14.950000000000001);
    expectScalar(result?.minMu1, 30, -9.999999999999998);
    expectScalar(result?.minMu2, 30, 0.47619047619047616);
    expectScalar(result?.minDelta, 20, 0);
    expectScalar(result?.maxDelta, 10, 0.10187246929372037);
    const noReverse = computeStabilityFactors(context(2, [networkSample(2, [[ri(0.5), ri(0)], [ri(1), ri(0)]])]));
    expect(noReverse?.minK).toEqual({ freq: 2, value: Infinity });
    expect(noReverse?.minMu1).toEqual({ freq: 2, value: Infinity });
    expectScalar(noReverse?.minMu2, 2, 2);
    expect(computeStabilityFactors(wrapped)).toBeNull();
    expect(computeStabilityFactors(context(2, []))).toBeNull();
  });
});

describe("range statistics and bandwidth", () => {
  const unsorted = samples([[6, 4], [4, NaN], [1, -1], [1, 4], [Infinity, 8], [2, 2]]);

  it("keeps input order for ties and span, with both odd and even medians", () => {
    const result = computeRangeStats(unsorted);
    expect(result?.count).toBe(4);
    expectPoint(result?.min, [1, -1]);
    expectPoint(result?.max, [6, 4]);
    expect(result?.average).toBeCloseTo(2.25, precision);
    expect(result?.median).toBeCloseTo(3, precision);
    expect(result?.spanHz).toBe(-4);
    expect(computeRangeStats(samples([[1, 7], [2, 3], [4, 4]]))?.median).toBeCloseTo(4, precision);
    expect(computeRangeStats(samples([[8, 7]]))).toEqual({
      count: 1, min: { freq: 8, amp: 7 }, max: { freq: 8, amp: 7 }, average: 7, median: 7, spanHz: 0,
    });
    expect(computeRangeStats([])).toBeNull();
  });

  it("ranks plateau edges and separated peaks, preserving stable ties and short-input fallback", () => {
    const data = samples([[0, 0], [1, 7], [2, 7], [3, 1], [4, 7], [Infinity, 9], [5, 2], [6, 5], [7, 0]]);
    expect(buildPeakSpurTable(data, { minSpacingHz: 2, minAmp: 6, limit: 2 })).toEqual([
      { rank: 1, freq: 1, amp: 7 }, { rank: 2, freq: 4, amp: 7 },
    ]);
    expect(buildPeakSpurTable(data, { limit: 3 })).toEqual([
      { rank: 1, freq: 1, amp: 7 }, { rank: 2, freq: 2, amp: 7 }, { rank: 3, freq: 4, amp: 7 },
    ]);
    expect(buildPeakSpurTable(samples([[3, 2], [2, 3], [1, 4]]))).toEqual([{ rank: 1, freq: 1, amp: 4 }]);
    expect(buildPeakSpurTable(samples([[3, 2], [2, 3]]), { limit: 1 })).toEqual([{ rank: 1, freq: 2, amp: 3 }]);
    expect(buildPeakSpurTable(samples([[3, 2]]), { minAmp: 3 })).toEqual([]);
    expect(buildPeakSpurTable([])).toEqual([]);
  });

  it("slices inclusively, preserves input order, and treats invalid ranges as unbounded", () => {
    expectPoints(sliceTraceToRange(unsorted, { left: 1, right: 2 }), [[1, -1], [1, 4], [2, 2]]);
    expectPoints(sliceTraceToRange(unsorted, { left: 2, right: 1 }), [[6, 4], [1, -1], [1, 4], [2, 2]]);
    expectPoints(sliceTraceToRange(unsorted, null), [[6, 4], [1, -1], [1, 4], [2, 2]]);
    expect(sliceTraceToRange(unsorted, { left: 8, right: 9 })).toEqual([]);
    expect(sliceTraceToRange([], undefined)).toEqual([]);
  });

  it("measures linear, sample, and mixed bandwidth crossings while filtering non-finite samples", () => {
    const mixed = computeBandwidth([...inBand.data, ...samples([[3, NaN], [Infinity, 4]])], 2, 0, -3);
    expect(mixed).toMatchObject({ refFreq: 2, refAmp: 0, level: -3, mode: "linear/sample" });
    expectNumbers([mixed?.left ?? NaN, mixed?.right ?? NaN, mixed?.bandwidth ?? NaN], [1.5, 3, 1.5]);
    const linear = computeBandwidth(inBand.data, 2, 0, 2);
    expect(linear?.mode).toBe("linear");
    expect(linear?.left).toBeCloseTo(1.6666666666666665, precision);
    expect(linear?.right).toBeCloseTo(2.6666666666666665, precision);
    expect(linear?.bandwidth).toBeCloseTo(1, precision);
    expect(computeBandwidth(inBand.data, 2, 0, 6)?.mode).toBe("sample/linear");
    expect(computeBandwidth(samples([[1, -3], [2, 0], [3, -3]]), 2, 0, 3)).toEqual({
      refFreq: 2, refAmp: 0, level: -3, left: 1, right: 3, bandwidth: 2, mode: "sample",
    });
  });

  it("returns no bandwidth for incomplete crossings, coincident X, and invalid reference values", () => {
    expect(computeBandwidth([], 0, 0, 3)).toBeNull();
    expect(computeBandwidth(samples([[2, 0]]), 2, 0, 3)).toBeNull();
    expect(computeBandwidth(samples([[2, 0], [4, -6]]), 2, 0, 3)).toBeNull();
    expect(computeBandwidth(samples([[2, -6], [2, 0], [2, -6]]), 2, 0, 3)).toBeNull();
    expect(computeBandwidth(samples([[3, -6], [2, 0], [1, -6]]), 2, 0, 3)).toBeNull();
    expect(computeBandwidth(inBand.data, 10, 0, 3)).toBeNull();
    expect(computeBandwidth(inBand.data, 2, Infinity, 3)).toBeNull();
  });
});

describe("markers", () => {
  it("finds the first nearest index on ties and accepts unsorted and duplicate X", () => {
    const data = samples([[4, 1], [0, 8], [2, 4], [2, 9]]);
    expect(nearestIndexByFreq(data, 3)).toBe(0);
    expect(nearestIndexByFreq(data, 2)).toBe(2);
    expect(nearestIndexByFreq(data, -2)).toBe(1);
    expect(nearestIndexByFreq(samples([[1, 8]]), 15)).toBe(0);
    expect(nearestIndexByFreq(data, Infinity)).toBe(-1);
    expect(nearestIndexByFreq([], 0)).toBe(-1);
  });

  it.each<[InterpolationStrategy, number, number, boolean]>([
    ["auto", 1.25, 7.5, true],
    ["exact", 1, 9, false],
    ["linear", 1.25, 7.5, true],
    ["nearest", 1.25, 9, true],
    ["previous", 1.25, 9, true],
    ["next", 1.25, 3, true],
    ["cubic", 1.25, 7.859095982142858, true],
    ["snap", 1, 9, false],
    ["sinc", 1.25, 8.28035560484942, true],
  ])("places a marker using %s interpolation", (strategy, freq, amp, interpolated) => {
    const placed = placeMarker(trace("curve", curvePairs, strategy), 1.25);
    expectPoint(placed, [freq, amp]);
    expect(placed).toMatchObject({ requestedFreq: 1.25, interpolated });
  });

  it("handles magnetic and exact hits, endpoint clamping, duplicate X, and empty traces", () => {
    const curve = trace("curve", curvePairs);
    const magnet = placeMarker(curve, 1.25, { nearestPointPixelDistance: 3, snapThresholdPx: 3 });
    expect(magnet).toEqual({ requestedFreq: 1.25, freq: 1, amp: 9, interpolated: false });
    expectPoint(placeMarker(curve, 1.25, { nearestPointPixelDistance: 4, snapThresholdPx: 3 }), [1.25, 7.5]);
    expect(placeMarker(curve, 2)).toEqual({ requestedFreq: 2, freq: 2, amp: 3, interpolated: false });
    expect(placeMarker(curve, 9)).toEqual({ requestedFreq: 9, freq: 4, amp: 5, interpolated: false });
    expectPoint(placeMarker(curve, -1), [0, 2]);
    expectPoint(placeMarker(trace("duplicate", [[0, 2], [1, 5], [1, 7], [3, 4]]), 1), [1, 5]);
    expectPoint(placeMarker(trace("single", [[4, 8]]), 6), [4, 8]);
    expectPoint(placeMarker(trace("pair", [[0, 2], [2, 3]], "sinc"), 1), [1, 2.5]);
    expectPoint(placeMarker({ ...trace("non-uniform", curvePairs, "sinc"), isUniform: false }, 1.25), [1.25, 7.5]);
    expect(placeMarker(trace("empty", []), 6)).toEqual({ requestedFreq: 6, freq: 6, amp: 0, interpolated: false });
    expect(placeMarker(curve, Infinity)).toEqual({ requestedFreq: Infinity, freq: Infinity, amp: 0, interpolated: false });
  });

  it("recognizes IP3 roles exactly, copies labeled markers, and uses the first marker for each role", () => {
    const f1: Marker = { id: "m1", label: "F1", freq: 100, amp: -8, trace: "curve", type: "normal", refId: null, interpolated: false };
    const f2 = { ...f1, id: "m2", label: "F2", freq: 110, amp: -9 };
    const im3l = { ...f1, id: "m3", label: "IM3L", freq: 90, amp: -45 };
    const other = { ...f1, label: "f1" };
    expect(["F1", "F2", "IM3L", "IM3U"].every(isIP3Label)).toBe(true);
    expect(isIP3Label("f1")).toBe(false);
    expect(isIP3Label(undefined)).toBe(false);
    expect(cloneMarkerWithoutIP3Label(f1)).toEqual({ ...f1, label: null });
    expect(cloneMarkerWithoutIP3Label(other)).toBe(other);
    expect(cloneMarkerWithoutIP3Label(null)).toBeNull();
    expect(getIP3PointsFromMarkers([f2, other, f1, { ...f1, freq: 101 }, im3l])).toEqual({
      f1: { freq: 100, amp: -8, trace: "curve", label: "F1" },
      f2: { freq: 110, amp: -9, trace: "curve", label: "F2" },
      im3l: { freq: 90, amp: -45, trace: "curve", label: "IM3L" },
      im3u: null,
    });
    expect(getIP3PointsFromMarkers([])).toEqual({ f1: null, f2: null, im3l: null, im3u: null });
  });

  it("finds plateau extrema and falls back to absolute extrema on short or monotonic runs", () => {
    const data = samples([[8, 1], [3, 5], [3, 5], [2, 0], [1, 4], [0, 2], [NaN, -5], [9, Infinity]]);
    expectPoints(buildExtrema(data, "max"), [[3, 5], [3, 5], [1, 4]]);
    expectPoints(buildExtrema(data, "min"), [[2, 0]]);
    expectPoints(buildExtrema(samples([[4, 8], [2, 3]]), "min"), [[2, 3]]);
    expectPoints(buildExtrema(samples([[4, 8]]), "max"), [[4, 8]]);
    expect(buildExtrema([], "max")).toEqual([]);
    expectPoint(findAbsoluteMax(data), [3, 5]);
    expectPoint(findAbsoluteMin(data), [2, 0]);
    expect(findAbsoluteMax([])).toBeNull();
    expect(findAbsoluteMin(samples([[0, NaN]]))).toBeNull();
    expect(isLocalExtremum(data, 1, "max")).toBe(true);
    expect(isLocalExtremum(data, 3, "min")).toBe(true);
    expect(isLocalExtremum(data, 0, "min")).toBe(false);
    expect(isLocalExtremum(samples([[1, 1]]), 0, "max")).toBe(false);
    expect(isLocalExtremum(samples([[0, 2], [1, 2], [2, 2]]), 1, "max")).toBe(false);
  });

  it("navigates extrema in sample order and searches around or away from specified frequencies", () => {
    const data = [...samples(curvePairs), { freq: 5, amp: Infinity }, { freq: NaN, amp: 10 }];
    expectPoint(findNextLocalExtremum(data, null, "right", "max"), [1, 9]);
    expectPoint(findNextLocalExtremum(data, null, "left", "max"), [3, 8]);
    expectPoint(findNextLocalExtremum(data, 1, "right", "max"), [3, 8]);
    expectPoint(findNextLocalExtremum(data, 3, "left", "max"), [1, 9]);
    expect(findNextLocalExtremum(data, 1, "left", "max")).toBeNull();
    expect(findNextLocalExtremum([], null, "right", "max")).toBeNull();
    expectPoint(findHighestPeakExcluding(data, [1, 2], 1), [3, 8]);
    expectPoint(findHighestPeakExcluding(data, [1], 0), [1, 9]);
    expect(findHighestPeakExcluding(data, [1], 9)).toBeNull();
    expectPoint(findPeakNearFreq(data, 2, 1), [1, 9]);
    expectPoint(findPeakNearFreq(data, 20, 0.1), [4, 5]);
    expect(findPeakNearFreq(data, NaN, 1)).toBeNull();
    expect(findPeakNearFreq([], 2, 1)).toBeNull();
  });
});

describe("Touchstone parser", () => {
  function expectMatrix(actual: ComplexMatrix | undefined, expected: ComplexMatrix): void {
    expect(actual).toHaveLength(expected.length);
    expected.forEach((row, r) => {
      expect(actual?.[r]).toHaveLength(row.length);
      row.forEach(({ re, im }, c) => {
        expect(actual?.[r]?.[c]?.re).toBeCloseTo(re, precision);
        expect(actual?.[r]?.[c]?.im).toBeCloseTo(im, precision);
      });
    });
  }

  it("infers one port, converts magnitude and phase, and preserves unsorted duplicate frequencies", () => {
    const result = parseTouchstoneFile("! calibration\n# MHz S MA R 75\n2 0.5 30\n1 1 -90\n1 0.25 0", "inferred.txt");
    const network = result.touchstoneNetwork;
    expect(result.format).toBe("touchstone");
    expect(result.meta).toMatchObject({ "Version": "1.0", "Port Count": "1", "Reference": "75" });
    expect(network).toMatchObject({ portCount: 1, referenceOhms: [75], comments: ["calibration"], dataFormat: "MA", version: 1 });
    expect(network?.samples.map(({ freq }) => freq)).toEqual([2000000, 1000000, 1000000]);
    expectMatrix(network?.samples[0]?.sMatrix, [[ri(0.43301270189221935, 0.25)]]);
    expectMatrix(network?.samples[1]?.sMatrix, [[ri(0, -1)]]);
    expectMatrix(network?.samples[2]?.sMatrix, [[ri(0.25)]]);
    expect(result.traces).toEqual([]);
    expect(result.datasets).toHaveLength(1);
    expect(result.displayTraces).toEqual([]);
  });

  it("reads v2 lower-triangular two-port data, per-port references, and the end marker", () => {
    const text = "[Version] 2.0\n# kHz S DB R 50\n[Number of Ports] 2\n[Reference] 50 75\n"
      + "[Matrix Format] Lower\n[Number of Frequencies] 1\n[Network Data]\n2 -6 0 -20 90 -3 180\n[End]\n9 1";
    const result = parseTouchstoneFile(text, "lower.s2p");
    const network = result.touchstoneNetwork;
    expect(result.meta).toMatchObject({ "Version": "2.0", "Port Count": "2", "Reference": "50, 75" });
    expect(network).toMatchObject({ portCount: 2, referenceOhms: [50, 75], matrixFormat: "lower", dataFormat: "DB", version: 2 });
    expect(network?.samples.map(({ freq }) => freq)).toEqual([2000]);
    expectMatrix(network?.samples[0]?.sMatrix, [
      [ri(0.5011872336272722), ri(0, 0.1)], [ri(0, 0.1), ri(-0.7079457843841379)],
    ]);
  });

  it("reads full RI data across lines and supports known-port files without samples", () => {
    const network = parseTouchstoneFile("# Hz S RI R 50\n6 1 -1 2 -2\n3 -3 4 -4", "full.s2p").touchstoneNetwork;
    expect(network?.referenceOhms).toEqual([50, 50]);
    expect(network?.samples.map(({ freq }) => freq)).toEqual([6]);
    expectMatrix(network?.samples[0]?.sMatrix, [[ri(1, -1), ri(3, -3)], [ri(2, -2), ri(4, -4)]]);
    const empty = parseTouchstoneFile("# GHz S RI R 50", "empty.s1p");
    expect(empty.touchstoneNetwork?.samples).toEqual([]);
    expect(empty.datasets).toHaveLength(1);
  });

  it("preserves rejection of missing options, malformed records, and incompatible metadata", () => {
    expect(() => parseTouchstoneFile("", "empty.s1p")).toThrow("Touchstone file is missing an option line.");
    expect(() => parseTouchstoneFile("1 2 3", "bad.s1p")).toThrow("Touchstone data encountered before the option line.");
    expect(() => parseTouchstoneFile("# Hz S RI R", "bad.s1p")).toThrow("missing a reference value after R.");
    expect(() => parseTouchstoneFile("# Hz S RI R Infinity", "bad.s1p")).toThrow("reference resistance must be a real positive number.");
    expect(() => parseTouchstoneFile("# Hz S RI\n1 NaN 0", "bad.s1p")).toThrow("Touchstone line 2 has an unreadable number 'NaN'.");
    expect(() => parseTouchstoneFile("# Hz S RI\n1 0 0\n2 0", "bad.s1p")).toThrow("Incomplete Touchstone network data at frequency sample 2.");
    expect(() => parseTouchstoneFile("[Number of Ports] 2\n# Hz S RI", "bad.s1p")).toThrow("port count does not match the file extension.");
    expect(() => parseTouchstoneFile("[Number of Frequencies] 2\n# Hz S RI\n1 0 0", "bad.s1p")).toThrow("does not match the parsed sample count.");
  });
});

describe("tabular parser", () => {
  it("counts finite preview X values with fractional and invalid starting rows", () => {
    const lines = tabularText.split("\n");
    expect(summarizeTabularPreview(lines, wizard)).toEqual({ dataRows: 5, xMin: 1, xMax: 4 });
    expect(summarizeTabularPreview(lines, { ...wizard, skipRows: Infinity, xCol: 1 })).toEqual({ dataRows: 6, xMin: 10, xMax: 400 });
    expect(summarizeTabularPreview(lines, { ...wizard, xCol: 8 })).toEqual({ dataRows: 0, xMin: null, xMax: null });
    expect(summarizeTabularPreview([], wizard)).toEqual({ dataRows: 0, xMin: null, xMax: null });
  });

  it("converts selected columns, drops invalid cells, and keeps datasets and display traces in surviving column order", () => {
    const result = parseTabularFile(tabularText, "run.csv", wizard);
    expect(result.format).toBe("tabular");
    expect(result.meta).toEqual({ Domain: "time", Columns: "3" });
    expect(result.columnIdentities).toEqual([{ index: 2, header: "CH2" }, { index: 1, header: "Amp (mV)" }]);
    expect(result.traces.map(({ units }) => units)).toEqual([{ x: "s", y: null }, { x: "s", y: "mV" }]);
    const expected: Sample[][] = [[[0.001, 3.5], [0.002, 4]], [[0.001, 5.5], [0.003, 15], [0.004, 20]]];
    expect(result.traces).toHaveLength(2);
    expect(result.datasets).toHaveLength(2);
    expect(result.displayTraces).toHaveLength(2);
    expected.forEach((data, i) => {
      expectPoints(result.traces[i]?.data, data);
      const dataset = result.datasets?.[i];
      const display = result.displayTraces?.[i];
      expect(dataset?.family).toBe("waveform");
      expect(display?.datasetId).toBe(dataset?.id);
      expect(display?.valueType).toBe("scalar");
      if (display?.valueType === "scalar") {
        expectPoints(display.points.map(({ x, y }) => ({ freq: x, amp: y })), data);
      }
    });
  });

  it("infers delimiter and units, offers the wizard for low confidence, and filters one-point traces", () => {
    const auto = parseTabularFile("Amplitude (dBm)\tFrequency (MHz)\n-5\t4\n-7\t2", "run.tsv", null);
    expect(auto.format).toBe("tabular");
    expect(auto.suggestedConfig).toMatchObject({ xCol: 1, yCols: [0], delimiter: "\t", skipRows: 1, domain: "frequency", xUnit: "MHz", xMult: 1e6 });
    expect(auto.traces[0]?.units).toEqual({ x: "Hz", y: "dBm" });
    expectPoints(auto.traces[0]?.data, [[2e6, -7], [4e6, -5]]);
    const ambiguous = parseTabularFile(tabularText, "run.csv", null);
    expect(ambiguous.format).toBe("needs-import-wizard");
    expect(ambiguous.suggestedConfig).toMatchObject({ delimiter: ";", skipRows: 2, xCol: 0, yCols: [1, 2] });
    expect(ambiguous.suggestedConfig?.confidence).toBeLessThan(0.55);
    expect(ambiguous.traces).toEqual([]);
    const single = parseTabularFile("Time (ms);Amp (mV);CH2\n1;10;7", "run.csv", wizard);
    expect(single).toMatchObject({ traces: [], datasets: [], displayTraces: [], columnIdentities: [] });
    expect(parseTabularFile("", "empty.csv", wizard).traces).toEqual([]);
  });
});

describe("reference lines", () => {
  const line: RefLine = { id: 1, type: "v", paneIds: ["p1"], value: 1.25, label: "V3" };
  const horizontal: RefLine = { ...line, id: 2, type: "h", label: "H2", value: 0 };
  const panes: PlacementPane[] = [
    { id: "p1", title: "First", renderMode: "cartesian", typed: true, settings: defaultPaneSettings() },
    { id: "p2", title: "Second", renderMode: "cartesian", typed: true, settings: defaultPaneSettings() },
    { id: "p3", title: "Third", renderMode: "cartesian", typed: true, settings: defaultPaneSettings() },
    { id: "table", title: "Table", renderMode: "table", typed: true, settings: defaultPaneSettings() },
  ];
  const entries: PlacementTrace[] = [
    { trace: trace("a", [], "linear", "hz"), paneIds: ["p1", "p2"] },
    { trace: trace("b", [], "linear", "s"), paneIds: ["p3"] },
  ];

  it("increments labels by orientation and derives a common unit only for consistent panes", () => {
    expect(nextLineLabel("v", [])).toBe("V1");
    expect(nextLineLabel("v", [line, horizontal, { ...line, label: "V12a" }, { ...line, label: "V?" }])).toBe("V13");
    expect(nextLineLabel("h", [line, horizontal])).toBe("H3");
    expect(linePaneXGroup("p1", entries)).toBe("Hz");
    expect(linePaneXGroup("missing", entries)).toBeNull();
    expect(linePaneXGroup("p1", [...entries, { trace: trace("b", [], "linear", "s"), paneIds: ["p1"] }])).toBeNull();
  });

  it("validates pane membership and preserves the last axis unit when removing a line's final pane", () => {
    expect(canSetLinePanes(line, ["p1", "p2"], panes, entries)).toEqual({ allowed: true });
    expect(canSetLinePanes(line, ["p1", "p3"], panes, entries)).toEqual({ allowed: false, reason: "The line and pane must have the same known X unit." });
    expect(canSetLinePanes(line, ["p1", "p1"], panes, entries)).toEqual({ allowed: false, reason: "A pane may only be listed once." });
    expect(canSetLinePanes(horizontal, ["p1", "p2"], panes, entries)).toEqual({ allowed: false, reason: "H lines belong to one pane." });
    expect(canSetLinePanes(line, ["missing"], panes, entries)).toEqual({ allowed: false, reason: "The target pane no longer exists." });
    expect(canSetLinePanes(line, ["table"], panes, entries)).toEqual({ allowed: false, reason: "The target pane has no chart axis." });
    expect(setLinePanes(line, [], panes, entries)).toEqual({ line: { ...line, paneIds: [] }, result: { allowed: true } });
    expect(setLinePanes(line, ["p3"], panes, entries).line).toBe(line);
    expect(addLinePane(line, "p1", panes, entries).line).toBe(line);
    expect(addLinePane(line, "p2", panes, entries)).toEqual({ line: { ...line, paneIds: ["p1", "p2"] }, result: { allowed: true } });
    expect(removeLinePane(line, "p2")).toBe(line);
    expect(removeLinePane(line, "p1", "Hz")).toEqual({ ...line, paneIds: [], axisUnit: "Hz" });
  });

  it("resolves vertical intersections using each trace's strategy and skips out-of-range and non-finite results", () => {
    const traces = [
      trace("snap", curvePairs, "snap"), trace("linear", curvePairs), trace("sinc", curvePairs, "sinc"),
      trace("outside", [[2, 7]]), trace("invalid", [[1.25, NaN]]), trace("empty", []),
    ];
    const result = computeVerticalIntersections(1.25, traces, "p1");
    expect(result.map(({ traceName, paneId }) => [traceName, paneId])).toEqual([["snap", "p1"], ["linear", "p1"], ["sinc", "p1"]]);
    expectPoints(result, [[1, 9], [1.25, 7.5], [1.25, 8.28035560484942]]);
    expectPoints(computeVerticalIntersections(2, [trace("single", [[2, 7]])], "p1"), [[2, 7]]);
    expect(computeVerticalIntersections(-1, traces, "p1")).toEqual([]);
    expect(computeVerticalIntersections(Infinity, traces, "p1")).toEqual([]);
  });

  it("records horizontal crossings and every exact hit, including duplicate X and the final point", () => {
    const signal = trace("signal", [[0, -3], [2, 1], [2, 0], [2, 0], [4, 4], [3, 0]]);
    const result = computeHorizontalIntersections(0, [signal, trace("single", [[7, 0]]), trace("empty", [])], "p2");
    expectPoints(result, [[1.5, 0], [2, 0], [2, 0], [3, 0], [7, 0]]);
    expect(result.map(({ traceName, paneId }) => [traceName, paneId])).toEqual([
      ["signal", "p2"], ["signal", "p2"], ["signal", "p2"], ["signal", "p2"], ["single", "p2"],
    ]);
    expect(computeHorizontalIntersections(NaN, [signal], "p2")).toEqual([]);
  });

  it("dispatches by orientation and intersects visible traces in pane order", () => {
    const a = trace("a", [[0, -3], [2, 1]]);
    const b = trace("b", [[0, 2], [2, 6]]);
    const memberships = { a: ["p1", "p2"], b: ["p2"] };
    const result = computeLineIntersections({ ...line, paneIds: ["p2", "p1"] }, [], [a, b], memberships, { a: true, b: false });
    expect(result.map(({ paneId }) => paneId)).toEqual(["p2", "p1"]);
    expectPoints(result, [[1.25, -0.5], [1.25, -0.5]]);
    expectPoints(computeLineIntersections(horizontal, [line], [a, b], memberships, { a: true, b: true }), [[1.5, 0]]);
    expect(computeLineIntersections({ ...line, paneIds: [] }, [], [a], memberships, { a: true })).toEqual([]);
  });
});
