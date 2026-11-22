import { describe, expect, it } from "vitest";
import {
  FAMILY_DEFAULTS,
  getInterpolationOptionDisabledReason,
  getResolvedInterpolationStrategy,
  isInterpolationOptionDisabled,
  isUniformDataPoints,
  isUniformScalarPoints,
  isUniformSpacing,
  resolveComplex,
  resolveValue,
} from "../../src/domain/interpolation";
import type { InterpolationStrategy } from "../../src/domain/interpolation";
import {
  applyBinaryTraceMathOp,
  computeBinaryTraceMathData,
  smoothTraceData,
} from "../../src/domain/trace-ops";
import type { BinaryOp, InterpolationMethod, SmoothingMethod } from "../../src/domain/trace-ops";
import {
  buildMatrixOrder,
  buildTouchstoneTraceLabel,
  cloneComplexMatrix,
  computeTwoPortStability,
  convertSMatrixToYMatrix,
  convertSMatrixToZMatrix,
  expandOrderedValuesToMatrix,
  getTouchstoneFileBaseName,
  makeComplexMatrix,
  matrixAdd,
  matrixIdentity,
  matrixInverse,
  matrixMultiply,
  matrixSubtract,
  normalizeMatrixFormat,
  normalizeReferenceArray,
  touchstonePairToComplex,
} from "../../src/domain/touchstone-math";
import type { DatasetFamily } from "../../src/types/dataset";
import type { Complex, ComplexMatrix, MatrixFormat } from "../../src/types/touchstone";
import type { DataPoint } from "../../src/types/trace";

const precision = 12;
type SamplePairs = readonly (readonly [x: number, y: number])[];

function trace(samples: SamplePairs): DataPoint[] {
  return samples.map(([freq, amp]) => ({ freq, amp }));
}

function complex(re: number, im = 0): Complex {
  return { re, im };
}

function expectTrace(actual: readonly DataPoint[] | undefined, expected: SamplePairs): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach(([freq, amp], index) => {
    expect(actual?.[index]?.freq).toBe(freq);
    expect(actual?.[index]?.amp).toBeCloseTo(amp, precision);
  });
}

function expectComplex(actual: Complex | undefined, expected: Complex): void {
  expect(actual?.re).toBeCloseTo(expected.re, precision);
  expect(actual?.im).toBeCloseTo(expected.im, precision);
}

function expectMatrix(actual: ComplexMatrix | null, expected: ComplexMatrix): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((row, rowIndex) => {
    expect(actual?.[rowIndex]).toHaveLength(row.length);
    row.forEach((value, colIndex) => {
      expectComplex(actual?.[rowIndex]?.[colIndex], value);
    });
  });
}

const evenlySpaced = trace([[0, 1], [1, 3], [2, 7], [3, 12], [4, 21]]);

describe("interpolation numeric characterization", () => {
  it.each<[InterpolationStrategy, number, number, number]>([
    ["auto", 1.5, 5, -8.5],
    ["exact", 1, 3, -5],
    ["linear", 1.5, 5, -8.5],
    ["nearest", 1.5, 3, -5],
    ["previous", 1.5, 3, -5],
    ["next", 1.5, 7, -12],
    ["cubic", 1.5, 4.852678571428571, -8.205357142857142],
    ["snap", 1, 3, -5],
    ["sinc", 1.5, 5.958285306512813, -10.174569024249333],
  ])("resolves scalar and complex values with %s", (strategy, x, y, im) => {
    const complexPoints = evenlySpaced.map(({ freq, amp }) => ({ x: freq, re: amp, im: amp * -2 + freq }));
    const scalarResult = resolveValue(evenlySpaced, 1.5, strategy, true);
    const complexResult = resolveComplex(complexPoints, 1.5, strategy, true);
    expect(scalarResult.x).toBe(x);
    expect(scalarResult.y).toBeCloseTo(y, precision);
    expect(complexResult.x).toBe(x);
    expectComplex(complexResult, complex(y, im));
  });

  const twoSamples: SamplePairs = [[2, 7], [4, 11]];
  const duplicateSamples: SamplePairs = [[0, 1], [1, 3], [1, 7], [2, 12]];
  it.each<[string, SamplePairs, number, InterpolationStrategy, boolean, number, number, number]>([
    ["empty input", [], 2, "linear", true, 2, 0, 0],
    ["one point", [[2, 7]], 10, "sinc", true, 2, 7, -7],
    ["two points with cubic", twoSamples, 3, "cubic", true, 3, 9, -9],
    ["two points with sinc", twoSamples, 2.5, "sinc", true, 2.5, 7.982865606427363, -7.982865606427363],
    ["below range", twoSamples, 1, "linear", true, 2, 7, -7],
    ["above range", twoSamples, 5, "sinc", true, 4, 11, -11],
    ["exact match at duplicate X", duplicateSamples, 1, "linear", false, 1, 3, -3],
    ["cubic fallback at duplicate X", duplicateSamples, 1.5, "cubic", false, 1.5, 9.5, -9.5],
    ["sinc fallback with zero spacing", [[0, 1], [0, 3], [2, 12]], 1, "sinc", true, 1, 7.5, -7.5],
    ["sinc fallback with infinite spacing", [[0, 1], [Infinity, 9]], 2, "sinc", true, 2, 1, -1],
    ["cubic fallback with unsorted X", [[0, 1], [2, 7], [1, 3], [3, 12]], 1.5, "cubic", false, 1.5, 5.5, -5.5],
    ["sinc fallback with uneven spacing", [[0, 1], [1, 3], [3, 12]], 2, "sinc", false, 2, 7.5, -7.5],
    ["NaN target", twoSamples, NaN, "linear", true, NaN, 0, 0],
    ["infinite target", twoSamples, Infinity, "linear", true, Infinity, 0, 0],
  ])("resolves %s", (_label, samples, target, strategy, uniform, x, y, im) => {
    const scalarResult = resolveValue(trace(samples), target, strategy, uniform);
    const complexPoints = samples.map(([freq, amp]) => ({ x: freq, re: amp, im: -amp }));
    const complexResult = resolveComplex(complexPoints, target, strategy, uniform);
    expect(scalarResult.x).toBe(x);
    expect(scalarResult.y).toBeCloseTo(y, precision);
    expect(complexResult.x).toBe(x);
    expectComplex(complexResult, complex(y, im));
  });

  it("checks spacing, including tolerance, short arrays, and invalid deltas", () => {
    for (const xs of [[], [Infinity], [1, NaN], [0, 1, 2]]) {
      expect(isUniformSpacing(xs)).toBe(true);
    }
    for (const xs of [[0, 1, 2.01], [0, 1, 1], [0, 2, 1], [0, 1, Infinity], [0, NaN, 2]]) {
      expect(isUniformSpacing(xs)).toBe(false);
    }
    expect(isUniformSpacing([0, 1, 2.01], 0.01)).toBe(true);
    expect(isUniformDataPoints(evenlySpaced)).toBe(true);
    expect(isUniformDataPoints(trace([[0, 1], [1, 2], [3, 4]]))).toBe(false);
    expect(isUniformScalarPoints([{ x: 0 }, { x: 1 }, { x: 2 }])).toBe(true);
    expect(isUniformScalarPoints([{ x: 0 }, { x: NaN }, { x: 2 }])).toBe(false);
  });

  it.each<[DatasetFamily, InterpolationStrategy, string]>([
    ["spectrum", "snap", "Sinc is not meaningful for FFT-bin spectrum traces."],
    ["waveform", "sinc", ""],
    ["network", "linear", "Sinc is not meaningful for swept network traces."],
    ["iq", "linear", ""],
    ["symbol", "snap", ""],
  ])("reports interpolation defaults and availability for %s", (family, defaultStrategy, reason) => {
    expect(FAMILY_DEFAULTS[family]).toBe(defaultStrategy);
    expect(getResolvedInterpolationStrategy(family, undefined, true)).toBe(defaultStrategy);
    expect(getResolvedInterpolationStrategy(family, "sinc", true)).toBe("sinc");
    expect(isInterpolationOptionDisabled(family, "sinc", true)).toBe(reason.length > 0);
    expect(getInterpolationOptionDisabledReason(family, "sinc", true)).toBe(reason);
    expect(getResolvedInterpolationStrategy(family, "sinc", false)).toBe("linear");
    expect(isInterpolationOptionDisabled(family, "sinc", false)).toBe(true);
    expect(getInterpolationOptionDisabledReason(family, "sinc", false)).toBe("Sinc requires uniformly spaced data.");
    expect(isInterpolationOptionDisabled(family, "cubic", false)).toBe(false);
    expect(getInterpolationOptionDisabledReason(family, "cubic", false)).toBe("");
  });
});

describe("trace operations numeric characterization", () => {
  it.each<[SmoothingMethod, number, number | null, readonly number[]]>([
    ["none", 1, null, [2, 1, 9, 3, 8, 5]],
    ["moving-average", 5, null, [4, 3.75, 4.6, 5.2, 6.25, 5.333333333333333]],
    ["median-filter", 5, null, [2, 2.5, 3, 5, 6.5, 5]],
    ["savitzky-golay", 5, 2, [2, 4.45, 4.885714285714286, 6.7714285714285705, 5.15, 5]],
  ])("smooths finite samples with %s", (mode, window, polyOrder, amps) => {
    const result = smoothTraceData(trace([[0, 2], [1, 1], [2, 9], [3, 3], [4, 8], [5, 5]]), mode, 4, 2);
    expect(result).toMatchObject({ window, polyOrder });
    expectTrace(result.data, amps.map((amp, freq) => [freq, amp]));
  });

  it.each<[SmoothingMethod, readonly number[]]>([
    ["moving-average", [5, 5, 4.666666666666667, 7, 5.75, 4.666666666666667, 4.666666666666667]],
    ["median-filter", [5, 5, 4, 8, 6, 4, 4]],
    ["savitzky-golay", [1, 5, 9, 4.333333333333333, 6.345454545454546, 8, 2]],
  ])("filters non-finite amplitudes in sample order with %s", (mode, amps) => {
    const samples = trace([[4, 1], [1, NaN], [1, 9], [3, Infinity], [0, 4], [2, 8], [6, 2]]);
    const expectedFrequencies = [4, 1, 1, 3, 0, 2, 6];
    const result = smoothTraceData(samples, mode, "4", 2);
    expect(result.window).toBe(5);
    expect(result.data.map(({ freq }) => freq)).toEqual(expectedFrequencies);
    expect(result.data).toHaveLength(amps.length);
    amps.forEach((amp, index) => expect(result.data[index]?.amp).toBeCloseTo(amp, precision));
  });

  it("falls back on short arrays and preserves amplitudes when no samples are finite", () => {
    expect(smoothTraceData([], "moving-average", undefined)).toEqual({ data: [], window: 3, polyOrder: null });
    const single = trace([[4, 3]]);
    expect(smoothTraceData(single, "savitzky-golay", 5, 2)).toEqual({ data: single, window: 1, polyOrder: 2 });
    const two = trace([[4, 3], [2, 5]]);
    expect(smoothTraceData(two, "median-filter", 5)).toEqual({ data: two, window: 1, polyOrder: null });
    const invalid = trace([[0, NaN], [1, Infinity], [2, -Infinity]]);
    expect(smoothTraceData(invalid, "none", 5)).toEqual({ data: invalid, window: 1, polyOrder: null });
    expect(smoothTraceData(invalid, "moving-average", 3).data).toEqual(invalid);
    expect(smoothTraceData(invalid, "median-filter", 3).data).toEqual(invalid);
    expect(smoothTraceData(invalid, "savitzky-golay", 3).data).toEqual(invalid);
  });

  it.each<[BinaryOp, number]>([["add", 9], ["subtract", 5], ["multiply", 14], ["divide", 3.5]])(
    "applies %s to amplitudes",
    (op, expected) => expect(applyBinaryTraceMathOp(7, 2, op)).toBeCloseTo(expected, precision),
  );

  it("rejects non-finite operands and division by zero", () => {
    expect(applyBinaryTraceMathOp(NaN, 2, "add")).toBeNull();
    expect(applyBinaryTraceMathOp(7, Infinity, "add")).toBeNull();
    expect(applyBinaryTraceMathOp(7, 0, "divide")).toBeNull();
  });

  const offset = trace([[-1, 99], [0.5, 10], [1.5, 11], [2.5, 12], [3.5, 13], [5, 99]]);
  it.each<[InterpolationMethod, InterpolationMethod, SamplePairs]>([
    ["auto", "linear", [[0.5, 12], [1.5, 16], [2.5, 21.5], [3.5, 29.5]]],
    ["linear", "linear", [[0.5, 12], [1.5, 16], [2.5, 21.5], [3.5, 29.5]]],
    ["nearest", "nearest", [[0.5, 11], [1.5, 14], [2.5, 19], [3.5, 25]]],
    ["previous", "previous", [[0.5, 11], [1.5, 14], [2.5, 19], [3.5, 25]]],
    ["next", "next", [[0.5, 13], [1.5, 18], [2.5, 24], [3.5, 34]]],
    ["cubic", "cubic", [[0.5, 11.75], [1.5, 15.8125], [2.5, 21.1875], [3.5, 29.8125]]],
  ])("aligns traces on their overlap with %s", (requested, appliedInterpolation, expected) => {
    const result = computeBinaryTraceMathData(offset, evenlySpaced, requested, "add");
    expect(result).toMatchObject({ appliedInterpolation, droppedPoints: 0 });
    expectTrace(result.data, expected);
  });

  it("matches aligned duplicate X values by their first amplitude and rejects unaligned exact mode", () => {
    const a = trace([[1, 9], [1, 5], [2, 12]]);
    const b = trace([[1, 2], [1, 7], [2, 4]]);
    const methods: InterpolationMethod[] = ["auto", "exact"];
    for (const method of methods) {
      const result = computeBinaryTraceMathData(a, b, method, "subtract");
      expect(result).toMatchObject({ appliedInterpolation: "exact", droppedPoints: 0 });
      expectTrace(result.data, [[1, 7], [1, 3], [2, 8]]);
    }
    expect(computeBinaryTraceMathData(offset, evenlySpaced, "exact", "add")).toEqual({
      error: "Exact only requires matching X samples over the overlap range.",
    });
  });

  it("retains A's X order, filters non-finite samples, and counts dropped divisions", () => {
    const a = trace([[0, 12], [NaN, 5], [1, 12], [1.5, Infinity], [2, 12], [3, 12]]);
    const b = trace([[0, 3], [1, 0], [2, NaN], [2.5, Infinity], [3, 6]]);
    const filtered = computeBinaryTraceMathData(a, b, "linear", "divide");
    expect(filtered).toMatchObject({ appliedInterpolation: "linear", droppedPoints: 1 });
    expectTrace(filtered.data, [[0, 4], [2, 4], [3, 2]]);
    const unsorted = computeBinaryTraceMathData(
      trace([[0, 1], [2, 2], [1, 3], [3, 4]]), trace([[0, 10], [1, 20], [2, 30], [3, 40]]), "linear", "add",
    );
    expectTrace(unsorted.data, [[0, 11], [2, 32], [1, 23], [3, 44]]);
  });

  it("uses the available X samples when one trace has no interior points", () => {
    const single = computeBinaryTraceMathData(trace([[2, 12]]), trace([[0, 3], [4, 9]]), "auto", "add");
    expect(single).toMatchObject({ appliedInterpolation: "linear", droppedPoints: 0 });
    expectTrace(single.data, [[2, 18]]);
    const both = computeBinaryTraceMathData(trace([[0, 4], [4, 12]]), trace([[1, 3], [3, 9]]), "linear", "add");
    expect(both).toMatchObject({ appliedInterpolation: "linear", droppedPoints: 0 });
    expectTrace(both.data, [[1, 9], [3, 19]]);
  });

  it("reports empty or disjoint overlap and operations with no valid output", () => {
    const noOverlap = { error: "No overlap between the selected traces." };
    expect(computeBinaryTraceMathData([], evenlySpaced, "linear", "add")).toEqual(noOverlap);
    expect(computeBinaryTraceMathData(trace([[5, 1]]), evenlySpaced, "linear", "add")).toEqual(noOverlap);
    expect(computeBinaryTraceMathData(trace([[0, 1]]), trace([[0, 0]]), "auto", "divide")).toEqual({
      error: "A / B produced no valid points over the overlap range.",
    });
    expect(computeBinaryTraceMathData(trace([[0, Infinity]]), trace([[0, 2]]), "auto", "add")).toEqual({
      error: "No valid points were produced over the overlap range.",
    });
  });
});

describe("Touchstone math numeric characterization", () => {
  const a = [[complex(0), complex(2, 1)], [complex(1, -1), complex(3)]];
  const b = [[complex(1), complex(-1, 2)], [complex(2), complex(1, 1)]];
  const onePort = [[complex(0.25, 0.1)]];
  const twoPort = [[complex(0.1, 0.2), complex(0.05, -0.01)], [complex(0.7, 0.2), complex(-0.3, 0.1)]];

  it("normalizes matrix format names", () => {
    expect(normalizeMatrixFormat(" UpPeR ")).toBe("upper");
    expect(normalizeMatrixFormat("lower")).toBe("lower");
    expect(normalizeMatrixFormat("full")).toBe("full");
    expect(normalizeMatrixFormat("other")).toBe("full");
    expect(normalizeMatrixFormat(undefined)).toBe("full");
  });

  it.each<[MatrixFormat, readonly (readonly [row: number, col: number])[], readonly Complex[], ComplexMatrix]>([
    ["full", [[0, 0], [1, 0], [0, 1], [1, 1]], [complex(1), complex(2, 3), complex(4, 5), complex(6)],
      [[complex(1), complex(4, 5)], [complex(2, 3), complex(6)]]],
    ["lower", [[0, 0], [1, 0], [1, 1]], [complex(1), complex(2, 3), complex(6)],
      [[complex(1), complex(2, 3)], [complex(2, 3), complex(6)]]],
    ["upper", [[0, 0], [0, 1], [1, 1]], [complex(1), complex(2, 3), complex(6)],
      [[complex(1), complex(2, 3)], [complex(2, 3), complex(6)]]],
  ])("traverses and expands %s matrices", (format, order, values, matrix) => {
    expect(buildMatrixOrder(2, format)).toEqual(order.map(([row, col]) => ({ row, col })));
    expect(buildMatrixOrder(0, format)).toEqual([{ row: 0, col: 0 }]);
    expect(expandOrderedValuesToMatrix(2, format, values)).toEqual(matrix);
  });

  it("expands one port, rejects wrong lengths, and zero-fills sparse values", () => {
    expect(expandOrderedValuesToMatrix(1, "full", [complex(2, 3)])).toEqual([[complex(2, 3)]]);
    expect(expandOrderedValuesToMatrix(2, "full", [])).toBeNull();
    expect(expandOrderedValuesToMatrix(2, "lower", [complex(1)])).toBeNull();
    const sparse = new Array<Complex>(3);
    sparse[0] = complex(1);
    sparse[2] = complex(6);
    expect(expandOrderedValuesToMatrix(2, "upper", sparse)).toEqual([[complex(1), complex(0)], [complex(0), complex(6)]]);
  });

  it("makes zero and identity matrices and deep-clones complex entries", () => {
    expect(makeComplexMatrix(2)).toEqual([[complex(0), complex(0)], [complex(0), complex(0)]]);
    expect(makeComplexMatrix(NaN)).toEqual([[complex(0)]]);
    expect(matrixIdentity(2)).toEqual([[complex(1), complex(0)], [complex(0), complex(1)]]);
    expect(matrixIdentity(1)).toEqual([[complex(1)]]);
    const clone = cloneComplexMatrix(a);
    expect(clone).toEqual(a);
    expect(clone).not.toBe(a);
    expect(clone[0]).not.toBe(a[0]);
    expect(clone[0]?.[0]).not.toBe(a[0]?.[0]);
    expect(cloneComplexMatrix([])).toEqual([]);
    expect(cloneComplexMatrix([[complex(Infinity, NaN)]])).toEqual([[complex(0)]]);
  });

  it("adds, subtracts, and multiplies one-port, two-port, and empty matrices", () => {
    expect(matrixAdd(a, b)).toEqual([[complex(1), complex(1, 3)], [complex(3, -1), complex(4, 1)]]);
    expect(matrixSubtract(a, b)).toEqual([[complex(-1), complex(3, -1)], [complex(-1, -1), complex(2, -1)]]);
    expect(matrixMultiply(a, b)).toEqual([[complex(4, 2), complex(1, 3)], [complex(7, -1), complex(4, 6)]]);
    const left = [[complex(2, 1)]];
    const right = [[complex(3, -2)]];
    expect(matrixAdd(left, right)).toEqual([[complex(5, -1)]]);
    expect(matrixSubtract(left, right)).toEqual([[complex(-1, 3)]]);
    expect(matrixMultiply(left, right)).toEqual([[complex(8, -1)]]);
    for (const op of [matrixAdd, matrixSubtract, matrixMultiply]) {
      expect(op([], [])).toEqual([[complex(0)]]);
    }
  });

  it("treats omitted cells in existing rows as zero in matrix arithmetic", () => {
    const left = [[complex(2)], [complex(3)]];
    const right = [[complex(4), complex(5)], []];
    expect(matrixAdd(left, right)).toEqual([[complex(6), complex(5)], [complex(3), complex(0)]]);
    expect(matrixSubtract(left, right)).toEqual([[complex(-2), complex(-5)], [complex(3), complex(0)]]);
    expect(matrixMultiply(left, right)).toEqual([[complex(8), complex(10)], [complex(12), complex(15)]]);
    expectMatrix(matrixInverse([[complex(2)], [complex(3), complex(1)]]),
      [[complex(0.5), complex(0)], [complex(-1.5), complex(1)]]);
  });

  it("inverts complex matrices with pivoting and rejects singular or empty matrices", () => {
    expectMatrix(matrixInverse(a), [[complex(-0.9, -0.3), complex(0.5, 0.5)], [complex(0.4, -0.2), complex(0)]]);
    expectMatrix(matrixInverse([[complex(2, 1)]]), [[complex(0.4, -0.2)]]);
    expect(matrixInverse([])).toBeNull();
    expect(matrixInverse([[complex(1), complex(2)], [complex(2), complex(4)]])).toBeNull();
  });

  it("normalizes scalar and per-port references and rejects invalid impedances", () => {
    expect(normalizeReferenceArray(50, 2)).toEqual([50, 50]);
    expect(normalizeReferenceArray([75], 2)).toEqual([75, 75]);
    expect(normalizeReferenceArray([50, 75], 2)).toEqual([50, 75]);
    expect(normalizeReferenceArray([50, 75], 0)).toEqual([50, 75]);
    expect(normalizeReferenceArray(75, NaN)).toEqual([75]);
    expect(normalizeReferenceArray([50, 75], 3)).toBeNull();
    expect(normalizeReferenceArray([], 1)).toBeNull();
    expect(normalizeReferenceArray([50, Infinity], 2)).toBeNull();
    expect(normalizeReferenceArray(-1, 1)).toBeNull();
    expect(normalizeReferenceArray(NaN, 1)).toBeNull();
    expect(normalizeReferenceArray(null, 2)).toBeNull();
  });

  it("converts RI, MA, and DB pairs and clamps non-finite components", () => {
    expect(touchstonePairToComplex("RI", 2, -3)).toEqual(complex(2, -3));
    expectComplex(touchstonePairToComplex("MA", 2, 30), complex(1.7320508075688774, 1));
    expectComplex(touchstonePairToComplex("DB", -6, -45), complex(0.3543928915419707, -0.3543928915419706));
    expect(touchstonePairToComplex("RI", Infinity, NaN)).toEqual(complex(0));
  });

  it("converts one- and two-port S-matrices to Z", () => {
    expectMatrix(convertSMatrixToZMatrix(onePort, 50), [[complex(81.00436681222708, 17.46724890829695)]]);
    expectMatrix(convertSMatrixToZMatrix(twoPort, [50, 75]), [
      [complex(58.71526458546347, 25.495497213538727), complex(5.316236692168587, 0.5857023189073878)],
      [complex(63.64571977697607, 42.19392318877299), complex(42.97535239676745, 10.462982386396144)],
    ]);
    expect(convertSMatrixToZMatrix([], 50)).toBeNull();
    expect(convertSMatrixToZMatrix(twoPort, [50, 75, 100])).toBeNull();
    expect(convertSMatrixToZMatrix([[complex(1)]], 50)).toBeNull();
  });

  it("converts one- and two-port S-matrices to Y", () => {
    expectMatrix(convertSMatrixToYMatrix(onePort, 50), [[complex(0.011796502384737678, -0.002543720190779014)]]);
    expectMatrix(convertSMatrixToYMatrix(twoPort, [50, 75]), [
      [complex(0.016798049801713448, -0.007137613325418262), complex(-0.001903224680629174, 0.0011173844719305703)],
      [complex(-0.0314622886475317, 0.0017380261550049413), complex(0.025712783657488223, -0.006046364044038698)],
    ]);
    expect(convertSMatrixToYMatrix([], 50)).toBeNull();
    expect(convertSMatrixToYMatrix(twoPort, [50, 75, 100])).toBeNull();
    expect(convertSMatrixToYMatrix([[complex(-1)]], 50)).toBeNull();
  });

  it("computes two-port stability factors, including zero-denominator cases", () => {
    const stability = computeTwoPortStability(twoPort);
    expectComplex(stability?.delta, complex(-0.087, -0.053));
    expect(stability?.deltaAbs).toBeCloseTo(0.10187246929372037, precision);
    expect(stability?.kFactor).toBeCloseTo(11.588699256200117, precision);
    expect(stability?.mu1).toBeCloseTo(2.7992404997065075, precision);
    expect(stability?.mu2).toBeCloseTo(3.269441021593351, precision);
    expect(stability?.unconditional).toBe(true);
    expect(computeTwoPortStability([[complex(0.5), complex(0)], [complex(1), complex(0)]])).toEqual({
      delta: complex(0), deltaAbs: 0, kFactor: Infinity, mu1: Infinity, mu2: 2, unconditional: true,
    });
    expect(computeTwoPortStability([[complex(2), complex(0)], [complex(1), complex(0)]])).toEqual({
      delta: complex(0), deltaAbs: 0, kFactor: -Infinity, mu1: -Infinity, mu2: 0.5, unconditional: false,
    });
    expect(computeTwoPortStability([[], []])).toEqual({
      delta: complex(0), deltaAbs: 0, kFactor: Infinity, mu1: Infinity, mu2: Infinity, unconditional: true,
    });
    expect(computeTwoPortStability(onePort)).toBeNull();
    expect(computeTwoPortStability([])).toBeNull();
  });

  it("extracts file base names and builds trace labels with optional cells and views", () => {
    expect(getTouchstoneFileBaseName("C:/RF\\amp.v2.s2p")).toBe("amp.v2");
    expect(getTouchstoneFileBaseName(".s1p")).toBe(".s1p");
    expect(getTouchstoneFileBaseName(null)).toBe("touchstone");
    expect(buildTouchstoneTraceLabel("C:/RF/amp.s2p", "s", 2, 1, " dB ")).toBe("amp S21 dB");
    expect(buildTouchstoneTraceLabel("amp.s1p", "z", null, NaN, "")).toBe("amp Z");
  });
});
