import { describe, expect, it } from "vitest";
import { parseRSDat, resetParserFileCounter } from "../../src/domain/parsers/rs-dat";
import { parseTabularFile } from "../../src/domain/parsers/tabular";
import type { WizardConfig } from "../../src/types/file";

// Intended rules: a cell is a number only if, once trimmed, it is non-empty and finite.
// A bad X skips the row; a bad Y skips only that trace's point; nothing bad becomes a made-up 0.

type Points = readonly { freq: number; amp: number }[];
const P = (...pairs: readonly (readonly [number, number])[]): Points => pairs.map(([freq, amp]) => ({ freq, amp }));

const config = (over: Partial<WizardConfig> = {}): WizardConfig => ({
  delimiter: ",", skipRows: 1, xCol: 0, yCols: [1], xMult: 1, yMult: 1, domain: "frequency", confidence: 1, headers: ["f", "a"], ...over,
});

function tabular(text: string, over: Partial<WizardConfig> = {}) {
  resetParserFileCounter();
  return parseTabularFile(text, "bad.csv", config(over));
}

describe("tabular parser: hostile input", () => {
  const cases: readonly [string, string, Partial<WizardConfig>, Points | null][] = [
    ["empty X cell", "f,a\n1,10\n,20\n3,30", {}, P([1, 10], [3, 30])],
    ["whitespace-only X cell", "f,a\n1,10\n   ,20\n3,30", {}, P([1, 10], [3, 30])],
    ["empty Y cell", "f,a\n1,10\n2,\n3,30", {}, P([1, 10], [3, 30])],
    ["whitespace-only Y cell", "f,a\n1,10\n2,  \n3,30", {}, P([1, 10], [3, 30])],
    ["Infinity in Y", "f,a\n1,10\n2,Infinity\n3,30", {}, P([1, 10], [3, 30])],
    ["-Infinity in Y", "f,a\n1,10\n2,-Infinity\n3,30", {}, P([1, 10], [3, 30])],
    ["Infinity in X", "f,a\n1,10\nInfinity,20\n3,30", {}, P([1, 10], [3, 30])],
    ["-Infinity in X", "f,a\n1,10\n-Infinity,20\n3,30", {}, P([1, 10], [3, 30])],
    ["1e999 in Y", "f,a\n1,10\n2,1e999\n3,30", {}, P([1, 10], [3, 30])],
    ["1e999 in X", "f,a\n1,10\n1e999,20\n3,30", {}, P([1, 10], [3, 30])],
    ["NaN in Y", "f,a\n1,10\n2,NaN\n3,30", {}, P([1, 10], [3, 30])],
    ["NaN in X", "f,a\nNaN,20\n1,10\n3,30", {}, P([1, 10], [3, 30])],
    ["UTF-8 BOM before the header", "﻿f,a\n1,10\n2,20", {}, P([1, 10], [2, 20])],
    ["UTF-8 BOM before the first data row", "﻿1,10\n2,20", { skipRows: 0 }, P([1, 10], [2, 20])],
    ["CRLF line endings", "f,a\r\n1,10\r\n2,20\r\n3,30\r\n", {}, P([1, 10], [2, 20], [3, 30])],
    ["mixed line endings", "f,a\r\n1,10\n2,20\r\n3,30\n", {}, P([1, 10], [2, 20], [3, 30])],
    ["a row with fewer columns", "f,a\n1,10\n2\n3,30", {}, P([1, 10], [3, 30])],
    ["a row with only a delimiter", "f,a\n1,10\n,\n3,30", {}, P([1, 10], [3, 30])],
    ["trailing delimiters", "f,a,\n1,10,\n2,20,\n3,30,", {}, P([1, 10], [2, 20], [3, 30])],
    ["only a header row", "f,a", {}, null],
    ["a header and one data row", "f,a\n1,10", {}, null],
    ["nothing but bad rows", "f,a\n,1\n2,\nNaN,3", {}, null],
  ];

  it.each(cases)("%s", (_name, text, over, expected) => {
    const parsed = tabular(text, over);
    if (expected === null) {
      expect(parsed.traces).toHaveLength(0);
    } else {
      expect(parsed.traces).toHaveLength(1);
      expect(parsed.traces[0]?.data).toEqual(expected);
    }
  });

  it("a bad Y cell skips only that trace's point", () => {
    const parsed = tabular("f,a,b\n1,10,100\n2,,200\n3,30,Infinity\n4,40,400", { yCols: [1, 2], headers: ["f", "a", "b"] });
    expect(parsed.traces).toHaveLength(2);
    expect(parsed.traces[0]?.data).toEqual(P([1, 10], [3, 30], [4, 40]));
    expect(parsed.traces[1]?.data).toEqual(P([1, 100], [2, 200], [4, 400]));
  });

  it("applies the multipliers only to valid cells", () => {
    const parsed = tabular("f,a\n1,10\n,20\n3,30", { xMult: 1000, yMult: 2 });
    expect(parsed.traces[0]?.data).toEqual(P([1000, 20], [3000, 60]));
  });
});

describe("R&S DAT parser: hostile input", () => {
  const dat = (...rows: string[]): string => ["Trace;1", "Values;", ...rows].join("\n");
  const cases: readonly [string, string, Points | null][] = [
    ["empty X cell", dat("1;10", ";20", "3;30"), P([1, 10], [3, 30])],
    ["whitespace-only X cell", dat("1;10", "   ;20", "3;30"), P([1, 10], [3, 30])],
    ["empty Y cell", dat("1;10", "2;", "3;30"), P([1, 10], [3, 30])],
    ["whitespace-only Y cell", dat("1;10", "2;  ", "3;30"), P([1, 10], [3, 30])],
    ["an empty cell between two values", dat("1;10", "2;;20", "3;30"), P([1, 10], [3, 30])],
    ["Infinity", dat("1;10", "2;Infinity", "3;30"), P([1, 10], [3, 30])],
    ["-Infinity", dat("1;10", "-Infinity;20", "3;30"), P([1, 10], [3, 30])],
    ["1e999", dat("1;10", "2;1e999", "3;30"), P([1, 10], [3, 30])],
    ["NaN", dat("1;10", "NaN;20", "3;30"), P([1, 10], [3, 30])],
    ["UTF-8 BOM at the start", "﻿" + dat("1;10", "2;20"), P([1, 10], [2, 20])],
    ["CRLF line endings", dat("1;10", "2;20", "3;30").replace(/\n/g, "\r\n"), P([1, 10], [2, 20], [3, 30])],
    ["mixed line endings", "Trace;1\r\nValues;\n1;10\r\n2;20\n3;30\r\n", P([1, 10], [2, 20], [3, 30])],
    ["trailing delimiters", dat("1;10;", "2;20;", "3;30;"), P([1, 10], [2, 20], [3, 30])],
    ["a row with a single value among pairs", dat("1;10", "2", "3;30"), P([1, 10], [3, 30])],
    ["only the header lines", dat(), null],
    ["a block of bad rows only", dat(";1", "Infinity;3", "NaN;4"), null],
  ];

  it.each(cases)("%s", (_name, text, expected) => {
    resetParserFileCounter();
    const parsed = parseRSDat(text, "bad.dat");
    if (expected === null) {
      expect(parsed.traces).toHaveLength(0);
    } else {
      expect(parsed.traces).toHaveLength(1);
      expect(parsed.traces[0]?.data).toEqual(expected);
    }
  });

  it("a bad row does not end the block: good rows after it are kept", () => {
    resetParserFileCounter();
    const parsed = parseRSDat(dat("1;10", ";99", "Infinity;5", "2;20", "3;30"), "bad.dat");
    expect(parsed.traces[0]?.data).toEqual(P([1, 10], [2, 20], [3, 30]));
  });

  it("a truncated first row does not turn a two-column block into an amplitude-only one", () => {
    resetParserFileCounter();
    const parsed = parseRSDat(dat("2;", "100;-30", "200;-31", "300;-32"), "bad.dat");
    expect(parsed.traces[0]?.data).toEqual(P([100, -30], [200, -31], [300, -32]));
  });

  it("amplitude-only rows still get their frequencies from Start and Stop", () => {
    resetParserFileCounter();
    const parsed = parseRSDat(["Start;100;Hz", "Stop;300;Hz", "Trace;1", "Values;", "-10", "-20", "-30"].join("\n"), "amp.dat");
    expect(parsed.traces[0]?.data).toEqual(P([100, -10], [200, -20], [300, -30]));
  });

  it("without trace declarations, a non-finite or blank pair is not read as data", () => {
    resetParserFileCounter();
    const parsed = parseRSDat("1;10\n;20\n2;Infinity\n3;30", "plain.dat");
    expect(parsed.traces[0]?.data).toEqual(P([1, 10], [3, 30]));
  });

  it("a non-finite metadata value is kept as text, not as Infinity", () => {
    resetParserFileCounter();
    const parsed = parseRSDat(["Start;Infinity;Hz", "Trace;1", "Values;", "1;10", "2;20"].join("\n"), "meta.dat");
    expect(parsed.meta["Start"]).toBe("Infinity");
  });
});
