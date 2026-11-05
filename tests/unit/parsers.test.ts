import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseMeasurementFile } from "../../src/domain/parsers/parse-file";
import { resetParserFileCounter } from "../../src/domain/parsers/rs-dat";

function fixture(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("known-good parser samples", () => {
  it("parses a current R&S DAT sample into a frequency trace", () => {
    resetParserFileCounter();
    const parsed = parseMeasurementFile(fixture("test files/cascade_ip3_-12dBm.DAT"), "cascade_ip3_-12dBm.DAT");

    expect(parsed.format).toBe("rs-dat");
    expect(parsed.traces).toHaveLength(1);
    expect(parsed.traces[0]?.domain).toBe("frequency");
    expect(parsed.traces[0]?.units.y).toBe("dBm");
    expect(parsed.traces[0]?.data.length).toBeGreaterThan(100);
  });

  it("parses a waveform CSV sample into usable tabular traces", () => {
    resetParserFileCounter();
    const parsed = parseMeasurementFile(fixture("test files/test_osc_waveform.csv"), "test_osc_waveform.csv");

    expect(parsed.format).toBe("tabular");
    expect(parsed.traces).toHaveLength(2);
    expect(parsed.traces.every((trace) => trace.domain === "time")).toBe(true);
    expect(parsed.traces.every((trace) => trace.data.length > 1)).toBe(true);
  });

  it("parses the sinc waveform fixture without locking unfinished parser edge cases", () => {
    resetParserFileCounter();
    const parsed = parseMeasurementFile(fixture("test files/waveform_sinc_test.csv"), "waveform_sinc_test.csv");

    expect(parsed.format).toBe("tabular");
    expect(parsed.traces).toHaveLength(2);
    expect(parsed.traces[0]?.data.length).toBeGreaterThan(10);
  });

  it("parses a Touchstone fixture into network display traces", () => {
    resetParserFileCounter();
    const parsed = parseMeasurementFile(fixture("test files/cascaded chain.s2p"), "cascaded chain.s2p");

    expect(parsed.format).toBe("touchstone");
    expect(parsed.touchstoneNetwork?.portCount).toBe(2);
    expect(parsed.touchstoneNetwork?.samples.length).toBeGreaterThan(10);
    expect(parsed.datasets?.some((dataset) => dataset.family === "network")).toBe(true);
  });

  it.todo("locks additional parser formats once their intended behavior is finished");
  it.todo("locks waveform CSV domain/family inference after parser heuristics are finalized");
  it.todo("locks Touchstone legacy trace projection counts after network view policy is finalized");
  it.todo("adds stricter malformed-file assertions after parser error policy is finalized");
});
