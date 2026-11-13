import { describe, expect, it } from "vitest";
import { parseMeasurementFile } from "../../src/domain/parsers/parse-file";
import { resetParserFileCounter } from "../../src/domain/parsers/rs-dat";
import type { NetworkDataset } from "../../src/types/dataset";
import type { ParsedFile } from "../../src/types/file";
import type { Complex, TouchstoneNetwork } from "../../src/types/touchstone";

function parseTouchstone(text: string, fileName: string): ParsedFile {
  resetParserFileCounter();
  return parseMeasurementFile(text, fileName);
}

function networkOf(parsed: ParsedFile): TouchstoneNetwork {
  expect(parsed.format).toBe("touchstone");
  expect(parsed.touchstoneNetwork).toBeDefined();
  return parsed.touchstoneNetwork!;
}

function expectNetworkShape(
  network: TouchstoneNetwork,
  expected: {
    portCount: number;
    dataFormat: TouchstoneNetwork["dataFormat"];
    freqUnit: string;
    referenceOhms: readonly number[];
    sampleCount: number;
  },
) {
  expect(network.portCount).toBe(expected.portCount);
  expect(network.dataFormat).toBe(expected.dataFormat);
  expect(network.freqUnit).toBe(expected.freqUnit);
  expect(network.referenceOhms).toEqual(expected.referenceOhms);
  expect(network.samples).toHaveLength(expected.sampleCount);

  for (const sample of network.samples) {
    expect(Number.isFinite(sample.freq)).toBe(true);
    expect(sample.sMatrix).toHaveLength(expected.portCount);
    for (const row of sample.sMatrix) {
      expect(row).toHaveLength(expected.portCount);
      for (const cell of row) {
        expect(Number.isFinite(cell.re)).toBe(true);
        expect(Number.isFinite(cell.im)).toBe(true);
      }
    }
  }
}

function cell(network: TouchstoneNetwork, sampleIndex: number, row: number, col: number): Complex {
  const value = network.samples[sampleIndex]?.sMatrix[row]?.[col];
  expect(value).toBeDefined();
  return value!;
}

function expectComplexClose(actual: Complex, expected: Complex, precision = 8) {
  expect(actual.re).toBeCloseTo(expected.re, precision);
  expect(actual.im).toBeCloseTo(expected.im, precision);
}

function sourceNetworkDataset(parsed: ParsedFile): NetworkDataset {
  const dataset = parsed.datasets?.find((item): item is NetworkDataset => item.family === "network" && item.kind === "source");
  expect(dataset).toBeDefined();
  return dataset!;
}

describe("Touchstone parser deep-dive contracts", () => {
  it("parses v1 s1p MA format with MHz frequency scaling", () => {
    const parsed = parseTouchstone("# MHz S MA R 50\n1 0.5 60\n2 0.25 -90\n", "one-port.s1p");
    const network = networkOf(parsed);

    expectNetworkShape(network, {
      portCount: 1,
      dataFormat: "MA",
      freqUnit: "MHz",
      referenceOhms: [50],
      sampleCount: 2,
    });
    expect(network.samples[0]?.freq).toBe(1_000_000);
    expect(network.samples[1]?.freq).toBe(2_000_000);
    expectComplexClose(cell(network, 0, 0, 0), { re: 0.25, im: 0.4330127018922193 });
    expectComplexClose(cell(network, 1, 0, 0), { re: 0, im: -0.25 });
  });

  it("parses v1 s2p RI format in S11, S21, S12, S22 order", () => {
    const parsed = parseTouchstone(
      "# Hz S RI R 50\n" +
        "1000 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8\n",
      "two-port.s2p",
    );
    const network = networkOf(parsed);

    expectNetworkShape(network, {
      portCount: 2,
      dataFormat: "RI",
      freqUnit: "Hz",
      referenceOhms: [50, 50],
      sampleCount: 1,
    });
    expect(network.samples[0]?.freq).toBe(1000);
    expectComplexClose(cell(network, 0, 0, 0), { re: 0.1, im: 0.2 });
    expectComplexClose(cell(network, 0, 1, 0), { re: 0.3, im: 0.4 });
    expectComplexClose(cell(network, 0, 0, 1), { re: 0.5, im: 0.6 });
    expectComplexClose(cell(network, 0, 1, 1), { re: 0.7, im: 0.8 });
  });

  it("parses v1 s2p DB format with GHz frequency scaling", () => {
    const parsed = parseTouchstone(
      "# GHz S DB R 50\n" +
        "1 -6 0 -20 90 -40 180 -3 -90\n",
      "db-format.s2p",
    );
    const network = networkOf(parsed);

    expectNetworkShape(network, {
      portCount: 2,
      dataFormat: "DB",
      freqUnit: "GHz",
      referenceOhms: [50, 50],
      sampleCount: 1,
    });
    expect(network.samples[0]?.freq).toBe(1_000_000_000);
    expectComplexClose(cell(network, 0, 0, 0), { re: 10 ** (-6 / 20), im: 0 });
    expectComplexClose(cell(network, 0, 1, 0), { re: 0, im: 10 ** (-20 / 20) });
    expectComplexClose(cell(network, 0, 0, 1), { re: -(10 ** (-40 / 20)), im: 0 });
    expectComplexClose(cell(network, 0, 1, 1), { re: 0, im: -(10 ** (-3 / 20)) });
  });

  it("parses Touchstone v2 metadata, references, and declared frequency count", () => {
    const parsed = parseTouchstone(
      "[Version] 2.0\n" +
        "[Number of Ports] 2\n" +
        "# MHz S RI R 50\n" +
        "[Reference] 50 75\n" +
        "[Number of Frequencies] 2\n" +
        "[Network Data]\n" +
        "1 0.1 0 0.2 0 0.3 0 0.4 0\n" +
        "2 0.5 0 0.6 0 0.7 0 0.8 0\n" +
        "[End]\n",
      "v2-file.s2p",
    );
    const network = networkOf(parsed);

    expect(parsed.meta.Version).toBe("2.0");
    expectNetworkShape(network, {
      portCount: 2,
      dataFormat: "RI",
      freqUnit: "MHz",
      referenceOhms: [50, 75],
      sampleCount: 2,
    });
    expect(network.version).toBe(2);
    expect(network.samples.map((sample) => sample.freq)).toEqual([1_000_000, 2_000_000]);
  });

  it("expands lower matrix format symmetrically", () => {
    const parsed = parseTouchstone(
      "[Version] 2.0\n" +
        "[Number of Ports] 2\n" +
        "# Hz S RI R 50\n" +
        "[Matrix Format] Lower\n" +
        "[Network Data]\n" +
        "1000 0.1 0 0.2 0 0.3 0\n" +
        "[End]\n",
      "lower.s2p",
    );
    const network = networkOf(parsed);

    expect(network.matrixFormat).toBe("lower");
    expectComplexClose(cell(network, 0, 0, 0), { re: 0.1, im: 0 });
    expectComplexClose(cell(network, 0, 1, 0), { re: 0.2, im: 0 });
    expectComplexClose(cell(network, 0, 0, 1), { re: 0.2, im: 0 });
    expectComplexClose(cell(network, 0, 1, 1), { re: 0.3, im: 0 });
  });

  it("expands upper matrix format symmetrically", () => {
    const parsed = parseTouchstone(
      "[Version] 2.0\n" +
        "[Number of Ports] 2\n" +
        "# Hz S RI R 50\n" +
        "[Matrix Format] Upper\n" +
        "[Network Data]\n" +
        "1000 0.1 0 0.2 0 0.3 0\n" +
        "[End]\n",
      "upper.s2p",
    );
    const network = networkOf(parsed);

    expect(network.matrixFormat).toBe("upper");
    expectComplexClose(cell(network, 0, 0, 0), { re: 0.1, im: 0 });
    expectComplexClose(cell(network, 0, 0, 1), { re: 0.2, im: 0 });
    expectComplexClose(cell(network, 0, 1, 0), { re: 0.2, im: 0 });
    expectComplexClose(cell(network, 0, 1, 1), { re: 0.3, im: 0 });
  });

  it("handles BOM, full-line comments, and inline comments", () => {
    const parsed = parseTouchstone(
      "\uFEFF! exported from fixture\n" +
        "# Hz S RI R 50 ! option comment\n" +
        "1000 0.1 0 ! first sample\n" +
        "2000 0.2 0\n",
      "comments.s1p",
    );
    const network = networkOf(parsed);

    expectNetworkShape(network, {
      portCount: 1,
      dataFormat: "RI",
      freqUnit: "Hz",
      referenceOhms: [50],
      sampleCount: 2,
    });
    expect(network.comments).toEqual(["exported from fixture", "option comment", "first sample"]);
  });

  it("throws a helpful error when the option line is missing", () => {
    expect(() => parseTouchstone("! comments only\n", "missing-option.s1p")).toThrow(/missing an option line/i);
  });

  it("throws when data appears before the option line", () => {
    expect(() => parseTouchstone("1000 0.1 0\n# Hz S RI R 50\n", "data-before-option.s1p")).toThrow(/before the option line/i);
  });

  it("throws when extension port count and v2 port count disagree", () => {
    expect(() => parseTouchstone(
      "[Version] 2.0\n[Number of Ports] 3\n# Hz S RI R 50\n",
      "mismatch.s2p",
    )).toThrow(/port count does not match/i);
  });

  it("throws on incomplete network data rows", () => {
    expect(() => parseTouchstone("# Hz S RI R 50\n1000 0.1 0 0.2 0\n", "incomplete.s2p")).toThrow(/incomplete touchstone network data/i);
  });

  it("throws on unsupported parameter types", () => {
    expect(() => parseTouchstone("# Hz Y RI R 50\n1000 0.1 0\n", "unsupported.s1p")).toThrow(/unsupported touchstone parameter type/i);
  });

  it("throws on unsupported mixed-mode order", () => {
    expect(() => parseTouchstone(
      "[Version] 2.0\n[Number of Ports] 2\n# Hz S RI R 50\n[Mixed-Mode Order] Diff1 Comm1\n",
      "mixed-mode.s2p",
    )).toThrow(/mixed-mode touchstone files are not supported yet/i);
  });

  it("creates a source network dataset contract without requiring scalar display projections", () => {
    const parsed = parseTouchstone(
      "# Hz S RI R 75\n" +
        "1000 0.1 0 0.2 0 0.3 0 0.4 0\n" +
        "2000 0.5 0 0.6 0 0.7 0 0.8 0\n",
      "dataset-contract.s2p",
    );
    const dataset = sourceNetworkDataset(parsed);

    expect(dataset.family).toBe("network");
    expect(dataset.kind).toBe("source");
    expect(dataset.xDomain).toBe("frequency");
    expect(dataset.parameterFamily).toBe("S");
    expect(dataset.portCount).toBe(2);
    expect(dataset.referenceOhms).toEqual([75, 75]);
    expect(dataset.samples).toHaveLength(2);
    expect(parsed.traces).toHaveLength(0);
  });
});
