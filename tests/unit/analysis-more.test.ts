import { describe, expect, it, vi } from "vitest";
import { buildPeakSpurTable, computeRangeStats, sliceTraceToRange } from "../../src/domain/analysis/range-stats";
import { computeRipple } from "../../src/domain/analysis/ripple";
import { findThresholdCrossings } from "../../src/domain/analysis/threshold";
import { makeSavedNoiseResult, noisePSD } from "../../src/domain/analysis/noise-psd";
import {
  computeGroupDelay,
  computeReciprocityIsolation,
  computeReturnLoss,
  computeStabilityFactors,
  computeVSWR,
} from "../../src/domain/analysis/touchstone";
import type { TouchstoneContext } from "../../src/types/analysis";
import type { TouchstoneNetwork } from "../../src/types/touchstone";

const traceData = [
  { freq: 0, amp: -20 },
  { freq: 10, amp: -10 },
  { freq: 20, amp: -15 },
  { freq: 30, amp: -8 },
  { freq: 40, amp: -30 },
];

function makeTouchstoneContext(): TouchstoneContext {
  const network: TouchstoneNetwork = {
    parameterType: "S",
    portCount: 2,
    referenceOhms: [50, 50],
    freqUnit: "Hz",
    dataFormat: "RI",
    comments: [],
    matrixFormat: "full",
    version: 1,
    samples: [
      {
        freq: 1,
        sMatrix: [
          [{ re: 0.1, im: 0 }, { re: 0.01, im: 0 }],
          [{ re: 0.02, im: 0 }, { re: 0.1, im: 0 }],
        ],
      },
      {
        freq: 2,
        sMatrix: [
          [{ re: 0.2, im: 0 }, { re: 0.02, im: 0 }],
          [{ re: 0.04, im: 0 }, { re: 0.15, im: 0 }],
        ],
      },
      {
        freq: 3,
        sMatrix: [
          [{ re: 0.3, im: 0 }, { re: 0.03, im: 0 }],
          [{ re: 0.06, im: 0 }, { re: 0.2, im: 0 }],
        ],
      },
    ],
  };

  return {
    isTouchstone: true,
    fileId: "fixture",
    fileName: "fixture.s2p",
    parameterType: "S",
    portCount: 2,
    family: "S",
    view: "dB",
    row: 0,
    col: 0,
    metric: null,
    referenceOhms: [50, 50],
    freqUnit: "Hz",
    dataFormat: "RI",
    comments: [],
    samples: null,
    network,
    source: null,
    traceLabel: "S11",
  };
}

describe("additional analysis helpers", () => {
  it("computes range stats, ripple, peaks, and range slicing", () => {
    expect(computeRangeStats(traceData)).toMatchObject({
      count: 5,
      min: { freq: 40, amp: -30 },
      max: { freq: 30, amp: -8 },
      median: -15,
      spanHz: 40,
    });
    expect(computeRipple(traceData)).toMatchObject({ ripple: 22, spanHz: 40 });
    expect(buildPeakSpurTable(traceData, { limit: 2 })).toEqual([
      { rank: 1, freq: 30, amp: -8 },
      { rank: 2, freq: 10, amp: -10 },
    ]);
    expect(sliceTraceToRange(traceData, { left: 10, right: 30 })).toHaveLength(3);
  });

  it("finds threshold crossings with interpolated frequencies", () => {
    expect(findThresholdCrossings([
      { freq: 0, amp: -1 },
      { freq: 10, amp: 1 },
      { freq: 20, amp: -1 },
    ], 0)).toEqual([
      { freq: 5, mode: "linear" },
      { freq: 15, mode: "linear" },
    ]);
  });

  it("computes noise PSD correction and saved result envelopes", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    vi.spyOn(Math, "random").mockReturnValue(0.25);

    const result = noisePSD([{ freq: 1, amp: -100 }], 1000, "flattop");
    expect(result[0]?.amp).toBeCloseTo(-130);

    expect(makeSavedNoiseResult({
      rbw: 1000,
      peak: { freq: 1, amp: -130 },
      min: { freq: 2, amp: -140 },
      avg: -135,
    }, "flattop", { id: "trace-1", name: "Trace 1", dn: "Display Trace" })).toMatchObject({
      id: 1000.25,
      functionType: "noise-psd",
      traceLabel: "Display Trace",
      parameters: { filter: "flattop", enbw: 1000, correction: 30 },
      values: { peak: -130, peakFreq: 1, min: -140, minFreq: 2, avg: -135 },
    });
  });

  it("summarizes Touchstone analysis for a simple two-port context", () => {
    const context = makeTouchstoneContext();

    expect(computeVSWR(context)).toMatchObject({ count: 3 });
    expect(computeReturnLoss(context)?.max.value).toBeCloseTo(20);
    expect(computeGroupDelay(context)).toMatchObject({ count: 1 });
    expect(computeReciprocityIsolation(context)).toMatchObject({ count: 3 });
    expect(computeStabilityFactors(context)).toMatchObject({ count: 3, unstableCount: 0 });
  });
});
