import { describe, expect, it } from "vitest";
import { classify } from "../../src/domain/parsers/classifier";
import { parseForImport, parseMeasurementFile, TOUCHSTONE_OPTION_TOKEN } from "../../src/domain/parsers/parse-file";
import { resetParserFileCounter } from "../../src/domain/parsers/rs-dat";
import { parseTouchstoneFile } from "../../src/domain/parsers/touchstone";
import { cx, div, mul, sub } from "../../src/domain/complex";
import { convertSMatrixToYMatrix, convertSMatrixToZMatrix } from "../../src/domain/touchstone-math";
import { DATA_FILE_ACCEPT } from "../../src/hooks/use-file-import";
import type { Complex, ComplexMatrix, TouchstoneNetwork } from "../../src/types/touchstone";

function parseTS(text: string, fileName: string) {
  resetParserFileCounter();
  return parseTouchstoneFile(text, fileName);
}

function positionCode(row1: number, col1: number): number {
  return 10 * row1 + col1;
}

function expectMatrixPositionCoded(network: TouchstoneNetwork, sampleIndex: number, ports: number) {
  const matrix = network.samples[sampleIndex]?.sMatrix;
  expect(matrix).toBeDefined();
  for (let r = 0; r < ports; r++) {
    for (let c = 0; c < ports; c++) {
      expect(matrix?.[r]?.[c]?.re).toBeCloseTo(positionCode(r + 1, c + 1), 10);
      expect(matrix?.[r]?.[c]?.im).toBeCloseTo(0, 10);
    }
  }
}

function expectMatricesClose(actual: ComplexMatrix | undefined, expected: ComplexMatrix, digits = 9) {
  expect(actual).toBeDefined();
  expect(actual).toHaveLength(expected.length);
  for (let r = 0; r < expected.length; r++) {
    const expRow = expected[r];
    expect(expRow).toBeDefined();
    for (let c = 0; c < (expRow?.length ?? 0); c++) {
      const a = actual?.[r]?.[c];
      const e = expRow?.[c];
      expect(a).toBeDefined();
      expect(e).toBeDefined();
      expect(a?.re).toBeCloseTo(e?.re ?? 0, digits);
      expect(a?.im).toBeCloseTo(e?.im ?? 0, digits);
    }
  }
}

function zToH(z: ComplexMatrix): Complex[][] {
  const z11 = z[0]?.[0] ?? cx(0, 0);
  const z12 = z[0]?.[1] ?? cx(0, 0);
  const z21 = z[1]?.[0] ?? cx(0, 0);
  const z22 = z[1]?.[1] ?? cx(0, 0);
  const detZ = sub(mul(z11, z22), mul(z12, z21));
  return [
    [div(detZ, z22) ?? cx(0, 0), div(z12, z22) ?? cx(0, 0)],
    [div(sub(cx(0, 0), z21), z22) ?? cx(0, 0), div(cx(1, 0), z22) ?? cx(0, 0)],
  ];
}

function zToG(z: ComplexMatrix): Complex[][] {
  const z11 = z[0]?.[0] ?? cx(0, 0);
  const z12 = z[0]?.[1] ?? cx(0, 0);
  const z21 = z[1]?.[0] ?? cx(0, 0);
  const z22 = z[1]?.[1] ?? cx(0, 0);
  const detZ = sub(mul(z11, z22), mul(z12, z21));
  return [
    [div(cx(1, 0), z11) ?? cx(0, 0), div(sub(cx(0, 0), z12), z11) ?? cx(0, 0)],
    [div(z21, z11) ?? cx(0, 0), div(detZ, z11) ?? cx(0, 0)],
  ];
}

function formatMatrixRI(matrix: ComplexMatrix, twoPortOrder: "21_12" | "12_21" = "21_12"): string {
  const n = matrix.length;
  if (n === 2 && twoPortOrder === "21_12") {
    const cells = [matrix[0]?.[0], matrix[1]?.[0], matrix[0]?.[1], matrix[1]?.[1]];
    return cells.map((c) => `${c?.re ?? 0} ${c?.im ?? 0}`).join(" ");
  }
  return matrix
    .map((row) => row.map((c) => `${c.re} ${c.im}`).join(" "))
    .join("\n");
}

describe("Touchstone 2.1 specification conformance", () => {
  describe("matrix cell ordering and cellOrder stamp", () => {
    it("parses v1 2-port in N11 N21 N12 N22 order and stamps cellOrder: 'spec'", () => {
      const parsed = parseTS("# Hz S RI R 50\n1000 11 0 21 0 12 0 22 0\n", "v1-2p.s2p");
      const net = parsed.touchstoneNetwork!;
      expect(net.cellOrder).toBe("spec");
      expectMatrixPositionCoded(net, 0, 2);
    });

    it("stamps cellOrder: 'spec' even on empty-sample Touchstone files", () => {
      const parsed = parseTS("# Hz S RI R 50\n", "empty.s1p");
      expect(parsed.touchstoneNetwork?.cellOrder).toBe("spec");
    });

    it("parses v1 3-port Full row-by-row (not transposed)", () => {
      const text = [
        "# GHz S RI R 50",
        "1.0 11 0 12 0 13 0",
        "    21 0 22 0 23 0",
        "    31 0 32 0 33 0",
      ].join("\n");
      const net = parseTS(text, "three.s3p").touchstoneNetwork!;
      expect(net.cellOrder).toBe("spec");
      expectMatrixPositionCoded(net, 0, 3);
    });

    it("parses v1 4-port Full row-by-row with 4 pairs per line", () => {
      const text = [
        "# GHz S RI R 50",
        "1.0 11 0 12 0 13 0 14 0",
        "    21 0 22 0 23 0 24 0",
        "    31 0 32 0 33 0 34 0",
        "    41 0 42 0 43 0 44 0",
      ].join("\n");
      const net = parseTS(text, "four.s4p").touchstoneNetwork!;
      expectMatrixPositionCoded(net, 0, 4);
    });

    it("parses v1 5-port wrapped rows (max 4 pairs per line)", () => {
      const text = [
        "# GHz S RI R 50",
        "1.0 11 0 12 0 13 0 14 0",
        "    15 0",
        "    21 0 22 0 23 0 24 0",
        "    25 0",
        "    31 0 32 0 33 0 34 0",
        "    35 0",
        "    41 0 42 0 43 0 44 0",
        "    45 0",
        "    51 0 52 0 53 0 54 0",
        "    55 0",
      ].join("\n");
      const net = parseTS(text, "five.s5p").touchstoneNetwork!;
      expectMatrixPositionCoded(net, 0, 5);
    });

    it("parses v2 2-port with [Two-Port Data Order] 12_21", () => {
      const text = [
        "[Version] 2.1",
        "# Hz S RI R 50",
        "[Number of Ports] 2",
        "[Two-Port Data Order] 12_21",
        "[Number of Frequencies] 1",
        "[Network Data]",
        "1000 11 0 12 0 21 0 22 0",
        "[End]",
      ].join("\n");
      const parsed = parseTS(text, "v2-1221.s2p");
      expect(parsed.meta["Two-Port Data Order"]).toBe("12_21");
      expectMatrixPositionCoded(parsed.touchstoneNetwork!, 0, 2);
    });

    it("parses v2 2-port with [Two-Port Data Order] 21_12", () => {
      const text = [
        "[Version] 2.1",
        "# Hz S RI R 50",
        "[Number of Ports] 2",
        "[Two-Port Data Order] 21_12",
        "[Number of Frequencies] 1",
        "[Network Data]",
        "1000 11 0 21 0 12 0 22 0",
        "[End]",
      ].join("\n");
      const parsed = parseTS(text, "v2-2112.s2p");
      expect(parsed.meta["Two-Port Data Order"]).toBe("21_12");
      expectMatrixPositionCoded(parsed.touchstoneNetwork!, 0, 2);
    });

    it("assumes 21_12 and records meta note when [Two-Port Data Order] is missing in v2 2-port", () => {
      const text = [
        "[Version] 2.1",
        "# Hz S RI R 50",
        "[Number of Ports] 2",
        "[Number of Frequencies] 1",
        "[Network Data]",
        "1000 11 0 21 0 12 0 22 0",
        "[End]",
      ].join("\n");
      const parsed = parseTS(text, "v2-missing-order.s2p");
      expect(parsed.meta["Two-Port Data Order"]).toBe("21_12 (assumed, keyword missing)");
      expectMatrixPositionCoded(parsed.touchstoneNetwork!, 0, 2);
    });

    it("rejects invalid [Two-Port Data Order] arguments and non-2-port usage", () => {
      expect(() =>
        parseTS("[Version] 2.1\n# Hz S RI\n[Number of Ports] 2\n[Two-Port Data Order] 99_99\n[Network Data]\n[End]", "bad.s2p"),
      ).toThrow(/Two-Port Data Order/i);
      expect(() =>
        parseTS("[Version] 2.1\n# Hz S RI\n[Number of Ports] 3\n[Two-Port Data Order] 12_21\n[Network Data]\n[End]", "bad.s3p"),
      ).toThrow(/only valid for 2-port/i);
    });

    it("parses v2 3-port Full, Lower, and Upper matrices in spec row-wise order", () => {
      const fullText = [
        "[Version] 2.1",
        "# GHz S RI R 50",
        "[Number of Ports] 3",
        "[Number of Frequencies] 1",
        "[Matrix Format] Full",
        "[Network Data]",
        "1.0 11 0 12 0 13 0 21 0 22 0 23 0 31 0 32 0 33 0",
        "[End]",
      ].join("\n");
      expectMatrixPositionCoded(parseTS(fullText, "full.s3p").touchstoneNetwork!, 0, 3);

      const lowerText = [
        "[Version] 2.1",
        "# GHz S RI R 50",
        "[Number of Ports] 3",
        "[Number of Frequencies] 1",
        "[Matrix Format] Lower",
        "[Network Data]",
        "1.0 11 0",
        "    21 0 22 0",
        "    31 0 32 0 33 0",
        "[End]",
      ].join("\n");
      const lowerNet = parseTS(lowerText, "lower.s3p").touchstoneNetwork!;
      expect(lowerNet.samples[0]?.sMatrix).toEqual([
        [cx(11, 0), cx(21, 0), cx(31, 0)],
        [cx(21, 0), cx(22, 0), cx(32, 0)],
        [cx(31, 0), cx(32, 0), cx(33, 0)],
      ]);

      const upperText = [
        "[Version] 2.1",
        "# GHz S RI R 50",
        "[Number of Ports] 3",
        "[Number of Frequencies] 1",
        "[Matrix Format] Upper",
        "[Network Data]",
        "1.0 11 0 12 0 13 0",
        "    22 0 23 0",
        "    33 0",
        "[End]",
      ].join("\n");
      const upperNet = parseTS(upperText, "upper.s3p").touchstoneNetwork!;
      expect(upperNet.samples[0]?.sMatrix).toEqual([
        [cx(11, 0), cx(12, 0), cx(13, 0)],
        [cx(12, 0), cx(22, 0), cx(23, 0)],
        [cx(13, 0), cx(23, 0), cx(33, 0)],
      ]);
    });
  });

  describe("[Reference] and v1.1 option-line references", () => {
    it("supports [Reference] on one line, split across lines, and starting on the next line", () => {
      const sameLine = parseTS(
        "[Version] 2.1\n# Hz S RI R 50\n[Number of Ports] 4\n[Reference] 50 75 0.01 0.01\n[Network Data]\n[End]",
        "ref1.s4p",
      );
      expect(sameLine.touchstoneNetwork?.referenceOhms).toEqual([50, 75, 0.01, 0.01]);

      const splitLines = parseTS(
        "[Version] 2.1\n# Hz S RI R 50\n[Number of Ports] 4\n[Reference] 50 75\n0.01 0.01\n[Network Data]\n[End]",
        "ref2.s4p",
      );
      expect(splitLines.touchstoneNetwork?.referenceOhms).toEqual([50, 75, 0.01, 0.01]);

      const nextLine = parseTS(
        "[Version] 2.1\n# Hz S RI R 50\n[Number of Ports] 4\n[Reference]\n50 75\n0,01 100\n[Network Data]\n[End]",
        "ref3.s4p",
      );
      expect(nextLine.touchstoneNetwork?.referenceOhms).toEqual([50, 75, 0.01, 100]);
    });

    it("rejects [Reference] with wrong count and stray numeric lines before [Network Data] in v2", () => {
      expect(() =>
        parseTS(
          "[Version] 2.1\n# Hz S RI R 50\n[Number of Ports] 4\n[Reference] 50 75 100\n[Network Data]\n[End]",
          "bad-ref.s4p",
        ),
      ).toThrow(/\[Reference\] count/i);

      expect(() =>
        parseTS(
          "[Version] 2.1\n# Hz S RI R 50\n[Number of Ports] 1\n1000 0.1 0\n[Network Data]\n[End]",
          "before-netdata.s1p",
        ),
      ).toThrow(/before \[Network Data\]/i);
    });

    it("supports Version 1.1 per-port R on the option line including decimal commas", () => {
      const parsed = parseTS("# S GHz RI R 50 75\n1.0 0.1 0 0.2 0 0.3 0 0.4 0\n", "v11.s2p");
      expect(parsed.meta.Version).toBe("1.1");
      expect(parsed.touchstoneNetwork?.referenceOhms).toEqual([50, 75]);

      const commaRef = parseTS("# S GHz RI R 50,5 75,25\n1.0 0.1 0 0.2 0 0.3 0 0.4 0\n", "v11-comma.s2p");
      expect(commaRef.touchstoneNetwork?.referenceOhms).toEqual([50.5, 75.25]);
      expect(TOUCHSTONE_OPTION_TOKEN.test("50,5")).toBe(true);
    });

    it("rejects v1.1 option-line R with wrong count, non-positive values, or non-trailing position", () => {
      expect(() =>
        parseTS("# GHz S RI R 50 75 100\n1.0 0.1 0 0.2 0 0.3 0 0.4 0\n", "bad-v11.s2p"),
      ).toThrow(/reference count/i);
      expect(() => parseTS("# GHz S RI R 50 0\n", "zero-r.s2p")).toThrow(/real positive number/i);
      expect(() => parseTS("# S R 50 75 GHz\n", "order-r.s2p")).toThrow(/end of the option line/i);
    });
  });

  describe("[Begin Information] ... [End Information]", () => {
    it("skips everything between [Begin Information] and [End Information]", () => {
      const text = [
        "[Version] 2.1",
        "# GHz S RI R 50",
        "[Number of Ports] 1",
        "[Number of Frequencies] 1",
        "[Begin Information]",
        "[Model_Data] 1 2 3 4",
        "arbitrary text and numbers 999 888",
        "[End Information]",
        "[Network Data]",
        "1.0 0.25 -0.5",
        "[End]",
      ].join("\n");
      const net = parseTS(text, "info.s1p").touchstoneNetwork!;
      expect(net.samples).toHaveLength(1);
      expect(net.samples[0]?.sMatrix[0]?.[0]).toEqual(cx(0.25, -0.5));
    });

    it("errors when [Begin Information] is unclosed", () => {
      expect(() =>
        parseTS("[Version] 2.1\n# Hz S RI\n[Number of Ports] 1\n[Begin Information]\n[Model] foo\n", "unclosed.s1p"),
      ).toThrow(/missing a closing \[End Information\]/i);
    });
  });

  describe("2-port Noise Data", () => {
    it("parses v1 2-port noise data starting when frequency <= previous network frequency", () => {
      const text = [
        "# GHz S MA R 50",
        "2 0.95 -26 3.57 157 0.04 76 0.66 -14",
        "22 0.60 -144 1.30 40 0.14 40 0.56 -85",
        "4 0.7 0.64 69 0.38",
        "18 2,7 0,46 -33 0,40",
      ].join("\n");
      const parsed = parseTS(text, "noise-v1.s2p");
      expect(parsed.touchstoneNetwork?.samples).toHaveLength(2);
      expect(parsed.meta["Noise Data"]).toBe("2 points (not displayed)");
    });

    it("parses v2 2-port [Noise Data] and validates [Number of Noise Frequencies]", () => {
      const text = [
        "[Version] 2.1",
        "# GHz S MA R 50",
        "[Number of Ports] 2",
        "[Two-Port Data Order] 21_12",
        "[Number of Frequencies] 2",
        "[Number of Noise Frequencies] 2",
        "[Network Data]",
        "2 0.95 -26 3.57 157 0.04 76 0.66 -14",
        "22 0.60 -144 1.30 40 0.14 40 0.56 -85",
        "[Noise Data]",
        "4 0.7 0.64 69 19",
        "18 2.7 0.46 -33 20",
        "[End]",
      ].join("\n");
      const parsed = parseTS(text, "noise-v2.s2p");
      expect(parsed.touchstoneNetwork?.samples).toHaveLength(2);
      expect(parsed.meta["Noise Data"]).toBe("2 points (not displayed)");
    });

    it("rejects malformed noise rows, noise count mismatches, and non-2-port noise", () => {
      expect(() =>
        parseTS(
          "# GHz S MA R 50\n2 0.95 -26 3.57 157 0.04 76 0.66 -14\n22 0.60 -144 1.30 40 0.14 40 0.56 -85\n4 0.7 0.64 69\n",
          "bad-noise-v1.s2p",
        ),
      ).toThrow(/noise data on line 4 must have 5 values/i);

      expect(() =>
        parseTS(
          "[Version] 2.1\n# Hz S RI\n[Number of Ports] 2\n[Number of Frequencies] 1\n[Number of Noise Frequencies] 2\n[Network Data]\n1 0 0 0 0 0 0 0 0\n[Noise Data]\n1 0.5 0.1 20 10\n[End]",
          "noise-mismatch.s2p",
        ),
      ).toThrow(/Number of Noise Frequencies/i);

      expect(() =>
        parseTS(
          "[Version] 2.1\n# Hz S RI\n[Number of Ports] 3\n[Number of Frequencies] 1\n[Network Data]\n1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0\n[Noise Data]\n1 0.5 0.1 20 10\n[End]",
          "noise-3p.s3p",
        ),
      ).toThrow(/only permitted for 2-port/i);
    });
  });

  describe("Y, Z, H, G to S parameter conversion", () => {
    const s2: ComplexMatrix = [
      [cx(0.25, -0.15), cx(0.12, 0.08)],
      [cx(0.55, -0.22), cx(-0.18, 0.31)],
    ];
    const s3: ComplexMatrix = [
      [cx(0.15, -0.1), cx(0.3, 0.12), cx(0.08, -0.04)],
      [cx(0.3, 0.12), cx(-0.2, 0.18), cx(0.25, 0.05)],
      [cx(0.08, -0.04), cx(0.25, 0.05), cx(0.1, -0.22)],
    ];

    it("round-trips v1 normalized Z and Y parameters to S within 1e-9", () => {
      const zNorm = convertSMatrixToZMatrix(s2, [1, 1])!;
      const zText = `# GHz Z RI R 50\n1.0 ${formatMatrixRI(zNorm, "21_12")}\n`;
      const parsedZ = parseTS(zText, "z-v1.s2p");
      expect(parsedZ.touchstoneNetwork?.parameterType).toBe("S");
      expect(parsedZ.meta["Parameter Type"]).toBe("Z (converted to S)");
      expectMatricesClose(parsedZ.touchstoneNetwork?.samples[0]?.sMatrix, s2, 9);

      const yNorm = convertSMatrixToYMatrix(s2, [1, 1])!;
      const yText = `# GHz Y RI R 75\n1.0 ${formatMatrixRI(yNorm, "21_12")}\n`;
      const parsedY = parseTS(yText, "y-v1.s2p");
      expect(parsedY.touchstoneNetwork?.parameterType).toBe("S");
      expect(parsedY.meta["Parameter Type"]).toBe("Y (converted to S)");
      expectMatricesClose(parsedY.touchstoneNetwork?.samples[0]?.sMatrix, s2, 9);
    });

    it("round-trips v1 normalized H and G 2-port parameters (and v1.1 unequal R normalized) to S within 1e-9", () => {
      const zNorm = convertSMatrixToZMatrix(s2, [1, 1])!;
      const hNorm = zToH(zNorm);
      const hText = `# GHz H RI R 50 75\n1.0 ${formatMatrixRI(hNorm, "21_12")}\n`;
      const parsedH = parseTS(hText, "h-v11.s2p");
      expect(parsedH.meta["Parameter Type"]).toBe("H (converted to S)");
      expect(parsedH.touchstoneNetwork?.referenceOhms).toEqual([50, 75]);
      expectMatricesClose(parsedH.touchstoneNetwork?.samples[0]?.sMatrix, s2, 9);

      const gNorm = zToG(zNorm);
      const gText = `# GHz G RI R 50\n1.0 ${formatMatrixRI(gNorm, "21_12")}\n`;
      const parsedG = parseTS(gText, "g-v1.s2p");
      expect(parsedG.meta["Parameter Type"]).toBe("G (converted to S)");
      expectMatricesClose(parsedG.touchstoneNetwork?.samples[0]?.sMatrix, s2, 9);
    });

    it("round-trips v2 unnormalized Z, Y, H, G with unequal [Reference] values to S within 1e-9", () => {
      const refs2 = [50, 75];
      const zActual = convertSMatrixToZMatrix(s2, refs2)!;
      const yActual = convertSMatrixToYMatrix(s2, refs2)!;
      const hActual = zToH(zActual);
      const gActual = zToG(zActual);

      const wrapV2 = (param: string, body: string, order: "21_12" | "12_21" = "12_21") =>
        [
          "[Version] 2.1",
          `# GHz ${param} RI R 50`,
          "[Number of Ports] 2",
          `[Two-Port Data Order] ${order}`,
          "[Number of Frequencies] 1",
          "[Reference] 50 75",
          "[Network Data]",
          `1.5 ${body}`,
          "[End]",
        ].join("\n");

      expectMatricesClose(parseTS(wrapV2("Z", formatMatrixRI(zActual, "12_21")), "z.s2p").touchstoneNetwork?.samples[0]?.sMatrix, s2, 9);
      expectMatricesClose(parseTS(wrapV2("Y", formatMatrixRI(yActual, "12_21")), "y.s2p").touchstoneNetwork?.samples[0]?.sMatrix, s2, 9);
      expectMatricesClose(parseTS(wrapV2("H", formatMatrixRI(hActual, "12_21")), "h.s2p").touchstoneNetwork?.samples[0]?.sMatrix, s2, 9);
      expectMatricesClose(parseTS(wrapV2("G", formatMatrixRI(gActual, "12_21")), "g.s2p").touchstoneNetwork?.samples[0]?.sMatrix, s2, 9);

      const refs3 = [50, 75, 100];
      const z3Actual = convertSMatrixToZMatrix(s3, refs3)!;
      const y3Actual = convertSMatrixToYMatrix(s3, refs3)!;
      const wrapV23p = (param: string, mat: ComplexMatrix) =>
        [
          "[Version] 2.1",
          `# MHz ${param} RI`,
          "[Number of Ports] 3",
          "[Number of Frequencies] 1",
          "[Reference] 50 75 100",
          "[Network Data]",
          `250 ${formatMatrixRI(mat)}`,
          "[End]",
        ].join("\n");

      expectMatricesClose(parseTS(wrapV23p("Z", z3Actual), "z3.s3p").touchstoneNetwork?.samples[0]?.sMatrix, s3, 9);
      expectMatricesClose(parseTS(wrapV23p("Y", y3Actual), "y3.s3p").touchstoneNetwork?.samples[0]?.sMatrix, s3, 9);
    });

    it("throws a clear error naming the frequency on singular Z/Y/H/G matrices and rejects 3-port H/G", () => {
      // 1-port Z = -50 ohms (v2) => z + 1 = -1 + 1 = 0 (singular)
      expect(() =>
        parseTS(
          "[Version] 2.1\n# MHz Z RI\n[Number of Ports] 1\n[Reference] 50\n[Network Data]\n250 -50 0\n[End]",
          "singular-z.s1p",
        ),
      ).toThrow(/singular matrix at frequency 250 MHz/i);

      // 2-port H with h22 = 0
      expect(() =>
        parseTS("# GHz H RI R 50\n3.5 1 0 0 0 0 0 0 0\n", "singular-h.s2p"),
      ).toThrow(/singular matrix at frequency 3\.5 GHz/i);

      // 2-port G with g11 = 0
      expect(() =>
        parseTS("# GHz G RI R 50\n4.2 0 0 0 0 0 0 1 0\n", "singular-g.s2p"),
      ).toThrow(/singular matrix at frequency 4\.2 GHz/i);

      // 3-port H and G rejected
      expect(() =>
        parseTS("[Version] 2.1\n# Hz H RI\n[Number of Ports] 3\n[Network Data]\n[End]", "h3.s3p"),
      ).toThrow(/H-parameters are only defined for 2-port/i);
      expect(() =>
        parseTS("[Version] 2.1\n# Hz G RI\n[Number of Ports] 3\n[Network Data]\n[End]", "g3.s3p"),
      ).toThrow(/G-parameters are only defined for 2-port/i);
    });
  });

  describe(".ts Touchstone extension routing", () => {
    it("includes .ts in DATA_FILE_ACCEPT", () => {
      expect(DATA_FILE_ACCEPT.split(",")).toContain(".ts");
    });

    it("routes .ts files with Touchstone content to the Touchstone parser (v2, v1 2-port + noise, v1 4-port)", () => {
      const v2Text = [
        "[Version] 2.1",
        "# GHz S RI R 50",
        "[Number of Ports] 3",
        "[Number of Frequencies] 1",
        "[Network Data]",
        "1.0 11 0 12 0 13 0 21 0 22 0 23 0 31 0 32 0 33 0",
        "[End]",
      ].join("\n");
      expect(classify(v2Text, "network.ts").format).toBe("touchstone");
      const v2Imported = parseForImport(v2Text, "network.ts");
      expect(v2Imported.format).toBe("touchstone");
      expectMatrixPositionCoded(v2Imported.touchstoneNetwork!, 0, 3);

      const v1Noise2p = [
        "! 2-port with noise in .ts",
        "# GHz S RI R 50",
        "1.0 11 0 21 0 12 0 22 0",
        "2.0 11 0 21 0 12 0 22 0",
        "0.5 0.8 0.5 30 0.4",
      ].join("\n");
      const imported2p = parseMeasurementFile(v1Noise2p, "amp.ts");
      expect(imported2p.format).toBe("touchstone");
      expect(imported2p.touchstoneNetwork?.portCount).toBe(2);
      expect(imported2p.meta["Noise Data"]).toBe("1 points (not displayed)");
      expectMatrixPositionCoded(imported2p.touchstoneNetwork!, 0, 2);

      const v1FourPort = [
        "# GHz S RI R 50",
        "1.0 11 0 12 0 13 0 14 0",
        "    21 0 22 0 23 0 24 0",
        "    31 0 32 0 33 0 34 0",
        "    41 0 42 0 43 0 44 0",
      ].join("\n");
      const imported4p = parseForImport(v1FourPort, "four-port.ts");
      expect(imported4p.format).toBe("touchstone");
      expect(imported4p.touchstoneNetwork?.portCount).toBe(4);
      expectMatrixPositionCoded(imported4p.touchstoneNetwork!, 0, 4);
    });

    it("does NOT route non-Touchstone .ts files to the Touchstone parser", () => {
      const tsCode = "import type { ParsedFile } from './file';\nexport const answer = 42;\n";
      expect(classify(tsCode, "module.ts").format).not.toBe("touchstone");
      const imported = parseForImport(tsCode, "module.ts");
      expect(imported.format).toBe("needs-import-wizard");

      const shebangTs = "#!/usr/bin/env tsx\nconsole.log('hello');\n";
      expect(classify(shebangTs, "script.ts").format).not.toBe("touchstone");
      expect(parseForImport(shebangTs, "script.ts").format).toBe("needs-import-wizard");
    });
  });
});
