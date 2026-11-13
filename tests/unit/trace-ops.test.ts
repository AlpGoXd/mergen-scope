import { describe, expect, it } from "vitest";
import {
  applyBinaryTraceMathOp,
  computeBinaryTraceMathData,
  smoothTraceData,
} from "../../src/domain/trace-ops";

describe("trace operations", () => {
  const a = [
    { freq: 0, amp: 0 },
    { freq: 10, amp: 10 },
    { freq: 20, amp: 20 },
  ];
  const b = [
    { freq: 0, amp: 1 },
    { freq: 20, amp: 5 },
  ];

  it("smooths traces with moving average and median filters", () => {
    expect(smoothTraceData([
      { freq: 0, amp: 0 },
      { freq: 1, amp: 100 },
      { freq: 2, amp: 2 },
    ], "moving-average", 3).data[1]?.amp).toBeCloseTo(34);

    expect(smoothTraceData([
      { freq: 0, amp: 0 },
      { freq: 1, amp: 100 },
      { freq: 2, amp: 2 },
    ], "median-filter", 3).data[1]?.amp).toBe(2);
  });

  it("normalizes smoothing windows and supports no-op smoothing", () => {
    const result = smoothTraceData(a, "none", 99);
    expect(result.window).toBe(1);
    expect(result.data).toEqual(a);

    expect(smoothTraceData(a, "savitzky-golay", 4, 9)).toMatchObject({
      window: 3,
      polyOrder: 2,
    });
  });

  it("applies scalar binary operations safely", () => {
    expect(applyBinaryTraceMathOp(10, 5, "add")).toBe(15);
    expect(applyBinaryTraceMathOp(10, 5, "subtract")).toBe(5);
    expect(applyBinaryTraceMathOp(10, 5, "multiply")).toBe(50);
    expect(applyBinaryTraceMathOp(10, 5, "divide")).toBe(2);
    expect(applyBinaryTraceMathOp(10, 0, "divide")).toBeNull();
  });

  it("computes binary trace math with interpolation over overlap only", () => {
    expect(computeBinaryTraceMathData(a, b, "linear", "subtract")).toMatchObject({
      appliedInterpolation: "linear",
      droppedPoints: 0,
      data: [
        { freq: 0, amp: -1 },
        { freq: 10, amp: 7 },
        { freq: 20, amp: 15 },
      ],
    });
  });

  it("reports exact-grid and no-overlap failures without throwing", () => {
    expect(computeBinaryTraceMathData(a, b, "exact", "subtract")).toMatchObject({
      error: "Exact only requires matching X samples over the overlap range.",
    });
    expect(computeBinaryTraceMathData(a, [{ freq: 100, amp: 1 }], "linear", "add")).toMatchObject({
      error: "No overlap between the selected traces.",
    });
  });
});
