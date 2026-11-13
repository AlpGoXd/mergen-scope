import { describe, expect, it } from "vitest";
import { parseMeasurementFile } from "../../src/domain/parsers/parse-file";
import { parseTabularFile } from "../../src/domain/parsers/tabular";
import { resetParserFileCounter } from "../../src/domain/parsers/rs-dat";
import type { ParsedFile, WizardConfig } from "../../src/types/file";
import type { Trace, TraceDomain } from "../../src/types/trace";

function parseCsv(text: string, fileName = "fixture.csv"): ParsedFile {
  resetParserFileCounter();
  return parseMeasurementFile(text, fileName);
}

function expectTraceInvariants(trace: Trace, domain: TraceDomain, family: "spectrum" | "waveform", pointCount: number) {
  expect(trace.domain).toBe(domain);
  expect(trace.family).toBe(family);
  expect(trace.data).toHaveLength(pointCount);

  for (let index = 0; index < trace.data.length; index++) {
    const point = trace.data[index]!;
    expect(Number.isFinite(point.freq)).toBe(true);
    expect(Number.isFinite(point.amp)).toBe(true);
    if (index > 0) {
      expect(point.freq).toBeGreaterThan(trace.data[index - 1]!.freq);
    }
  }
}

function expectDatasetFamily(parsed: ParsedFile, family: "spectrum" | "waveform") {
  expect(parsed.datasets).toBeDefined();
  expect(parsed.datasets?.every((dataset) => dataset.family === family)).toBe(true);
  expect(parsed.displayTraces?.every((displayTrace) => displayTrace.family === family)).toBe(true);
}

describe("penetrating CSV parser heuristics", () => {
  it("parses confident time CSV headers into waveform traces", () => {
    const parsed = parseCsv("Time (s),CH1 (V),CH2 (V)\n0,1,2\n0.5,1.5,2.5\n1,2,3\n", "scope.csv");

    expect(parsed.format).toBe("tabular");
    expect(parsed.traces).toHaveLength(2);
    expectDatasetFamily(parsed, "waveform");
    expectTraceInvariants(parsed.traces[0]!, "time", "waveform", 3);
    expectTraceInvariants(parsed.traces[1]!, "time", "waveform", 3);
    expect(parsed.traces[0]?.dn).toBe("scope.csv ch1 (v)");
    expect(parsed.traces[0]?.units).toEqual({ x: "s", y: "V" });
    expect(parsed.traces[0]?.data[0]).toEqual({ freq: 0, amp: 1 });
    expect(parsed.traces[1]?.data[2]).toEqual({ freq: 1, amp: 3 });
  });

  it("parses confident frequency CSV headers into a spectrum trace without the wizard", () => {
    const parsed = parseCsv("Frequency (Hz),Magnitude (dBm)\n100,-30\n200,-20\n300,-25\n", "spectrum.csv");

    expect(parsed.format).toBe("tabular");
    expect(parsed.traces).toHaveLength(1);
    expectDatasetFamily(parsed, "spectrum");
    expectTraceInvariants(parsed.traces[0]!, "frequency", "spectrum", 3);
    expect(parsed.traces[0]?.units).toEqual({ x: "Hz", y: "dBm" });
    expect(parsed.traces[0]?.data.at(-1)).toEqual({ freq: 300, amp: -25 });
  });

  it("routes ambiguous numeric CSV through the import wizard with a useful suggestion", () => {
    const parsed = parseCsv("1,2\n2,3\n", "ambiguous.csv");

    expect(parsed.format).toBe("needs-import-wizard");
    expect(parsed.suggestedConfig).toMatchObject({
      delimiter: ",",
      skipRows: 0,
      xCol: 0,
      yCols: [1],
      domain: "time",
    });
    expect(parsed.previewLines).toEqual(["1,2", "2,3"]);
    expect(parsed.traces).toHaveLength(0);
  });

  it("detects semicolon and tab delimiters beyond comma-only happy paths", () => {
    const semicolon = parseCsv("Time (s);CH1 (V);CH2 (V)\n0;1;2\n1;3;4\n", "semicolon.csv");
    const tab = parseCsv("Frequency (Hz)\tMagnitude (dBm)\n10\t-1\n20\t-2\n", "tab.csv");

    expect(semicolon.format).toBe("tabular");
    expect(semicolon.suggestedConfig?.delimiter).toBe(";");
    expect(semicolon.traces).toHaveLength(2);
    expectTraceInvariants(semicolon.traces[0]!, "time", "waveform", 2);

    expect(tab.format).toBe("tabular");
    expect(tab.suggestedConfig?.delimiter).toBe("\t");
    expect(tab.traces).toHaveLength(1);
    expectTraceInvariants(tab.traces[0]!, "frequency", "spectrum", 2);
  });

  it("finds headers and numeric data after a metadata row", () => {
    const parsed = parseCsv("Instrument: demo export\nTime (s),CH1 (V)\n0,1\n1,2\n", "header-offset.csv");

    expect(parsed.format).toBe("tabular");
    expect(parsed.suggestedConfig).toMatchObject({
      delimiter: ",",
      skipRows: 2,
      headers: ["time (s)", "ch1 (v)"],
    });
    expect(parsed.traces).toHaveLength(1);
    expect(parsed.traces[0]?.dn).toBe("header-offset.csv ch1 (v)");
    expectTraceInvariants(parsed.traces[0]!, "time", "waveform", 2);
  });

  it("ignores bad rows without throwing and keeps valid parsed points", () => {
    const parsed = parseCsv("Time (s),CH1 (V)\n0,1\nbad,row\n\n1,\n2,3\n", "bad-rows.csv");

    expect(parsed.format).toBe("tabular");
    expect(parsed.traces).toHaveLength(1);
    expect(parsed.traces[0]?.data).toEqual([
      { freq: 0, amp: 1 },
      { freq: 2, amp: 3 },
    ]);
    expectTraceInvariants(parsed.traces[0]!, "time", "waveform", 2);
  });

  it("normalizes unsorted and duplicate X values with latest duplicate winning", () => {
    const parsed = parseCsv("Frequency (Hz),Magnitude (dBm)\n300,-30\n100,-10\n200,-20\n100,-11\n", "stress.csv");

    expect(parsed.format).toBe("tabular");
    expect(parsed.traces).toHaveLength(1);
    expect(parsed.traces[0]?.data).toEqual([
      { freq: 100, amp: -11 },
      { freq: 200, amp: -20 },
      { freq: 300, amp: -30 },
    ]);
    expectTraceInvariants(parsed.traces[0]!, "frequency", "spectrum", 3);
  });

  it("applies explicit wizard config columns, multipliers, and domain exactly", () => {
    resetParserFileCounter();
    const config: WizardConfig = {
      delimiter: ",",
      skipRows: 1,
      xCol: 0,
      yCols: [2],
      xMult: 1e-3,
      yMult: 2,
      domain: "time",
      confidence: 1,
      headers: ["time ms", "skip", "ch2 v"],
    };

    const parsed = parseTabularFile("time ms,skip,ch2 v\n0,99,1\n1000,98,2\n", "manual.csv", config);

    expect(parsed.format).toBe("tabular");
    expect(parsed.traces).toHaveLength(1);
    expect(parsed.traces[0]?.dn).toBe("manual.csv ch2 v");
    expect(parsed.traces[0]?.units).toEqual({ x: "ms", y: "V" });
    expect(parsed.traces[0]?.data).toEqual([
      { freq: 0, amp: 2 },
      { freq: 1, amp: 4 },
    ]);
    expectTraceInvariants(parsed.traces[0]!, "time", "waveform", 2);
  });
});
