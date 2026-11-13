import { describe, expect, it } from "vitest";
import { formatEng, parseEngInput, type ParseEngInputResult } from "../../src/domain/units";

function valueOf(result: ParseEngInputResult): number {
  if (!result.ok) throw new Error(`Expected a parsed value, received ${result.reason}`);
  return result.value;
}

describe("engineering scalar formatting", () => {
  it("uses step precision and groups long frequency fractions", () => {
    expect(formatEng(1.42035e9, "Hz", 1e3)).toBe("1.420 350 GHz");
    expect(formatEng(500e6, "Hz", 500e6)).toBe("500 MHz");
    expect(formatEng(1.2e-3, "V", 1e-6)).toBe("1.200 mV");
    expect(formatEng(2.5, "Hz", 2.5)).toBe("2.5 Hz");
    expect(formatEng(1.25, "V", 0.25)).toBe("1.25 V");
    expect(formatEng(12.5e6, "Hz", 2.5e6)).toBe("12.5 MHz");
    expect(formatEng(1.2, "V", 0.30000000000000004)).toBe("1.2 V");
    expect(formatEng(1.125, "V", 0.125)).toBe("1.125 V");
  });

  it("removes only a wholly zero fraction and normalizes negative zero", () => {
    expect(formatEng(10, "V", 0.01)).toBe("10 V");
    expect(formatEng(-0, "Hz", 1)).toBe("0 Hz");
    expect(formatEng(-0.0001, "V", 0.001)).toBe("0 mV");
  });

  it("promotes a rounded 1000 to the next prefix", () => {
    expect(formatEng(999.5, "Hz", 1)).toBe("1 kHz");
    expect(formatEng(999.4, "Hz", 1)).toBe("999 Hz");
  });

  it("keeps prefix case and dB-family values distinct", () => {
    expect(formatEng(1e6, "V", 1e3)).toBe("1 MV");
    expect(formatEng(1e-3, "V", 1e-6)).toBe("1 mV");
    expect(formatEng(1e-3, "S", 1e-6)).toBe("1 mS");
    expect(formatEng(1e-3, "s", 1e-6)).toBe("1 ms");
    expect(formatEng(1000, "dBm", 1000)).toBe("1000 dBm");
  });

  it("handles finite values beyond the common prefix range and rejects nonfinite values", () => {
    expect(formatEng(1e24, "Hz", 1e18)).toBe("1 YHz");
    expect(formatEng(1e-24, "Hz", 1e-27)).toBe("1 yHz");
    expect(formatEng(1e300, "Hz", 1e299)).toBe("1e+270 QHz");
    expect(formatEng(1e-300, "Hz", 1e-301)).toBe("1e−270 qHz");
    expect(formatEng(-1e-300, "Hz", 1e-301)).toBe("−1e−270 qHz");
    expect(formatEng(-12.4, "V", 0.1)).toBe("−12.4 V");
    const fineValue = 1.420350000000001e9;
    const fineFormatted = formatEng(fineValue, "Hz", 1e-8);
    expect(valueOf(parseEngInput(fineFormatted, { baseUnit: "Hz" }))).toBe(fineValue);
    expect(formatEng(Number.NaN, "Hz", 1)).toBe("--");
    expect(formatEng(Number.POSITIVE_INFINITY, "Hz", 1)).toBe("--");
  });
});

describe("engineering scalar input parsing", () => {
  it("parses explicit units, bare prefixes with context, exponents and real minus", () => {
    expect(valueOf(parseEngInput("1.42035 GHz", { baseUnit: "Hz" }))).toBe(1.42035e9);
    expect(valueOf(parseEngInput("1420.35M", { baseUnit: "Hz" }))).toBe(1.42035e9);
    expect(valueOf(parseEngInput("1.42035e9", { baseUnit: "Hz" }))).toBe(1.42035e9);
    expect(valueOf(parseEngInput("−12.4"))).toBe(-12.4);
    expect(valueOf(parseEngInput("1.2 ms", { baseUnit: "s" }))).toBe(0.0012);
  });

  it("round-trips grouped frequency precision and accepts both micro characters", () => {
    const formatted = formatEng(1.42035e9, "Hz", 1e3);
    expect(formatted).toBe("1.420 350 GHz");
    expect(valueOf(parseEngInput(formatted, { baseUnit: "Hz" }))).toBe(1.42035e9);
    const partialFinalGroup = formatEng(1.42035e9, "Hz", 1e4);
    expect(partialFinalGroup).toBe("1.420 35 GHz");
    expect(valueOf(parseEngInput(partialFinalGroup, { baseUnit: "Hz" }))).toBe(1.42035e9);
    expect(valueOf(parseEngInput("2 µV", { baseUnit: "V" }))).toBe(2e-6);
    expect(valueOf(parseEngInput("2 μV", { baseUnit: "V" }))).toBe(2e-6);
  });

  it("preserves SI prefix case and distinguishes seconds from siemens", () => {
    expect(valueOf(parseEngInput("1 MHz", { baseUnit: "Hz" }))).toBe(1e6);
    expect(valueOf(parseEngInput("1 mHz", { baseUnit: "Hz" }))).toBe(1e-3);
    expect(valueOf(parseEngInput("1 MV", { baseUnit: "V" }))).toBe(1e6);
    expect(valueOf(parseEngInput("1 mV", { baseUnit: "V" }))).toBe(1e-3);
    expect(valueOf(parseEngInput("1 S"))).toBe(1);
    expect(valueOf(parseEngInput("1 s"))).toBe(1);
    expect(valueOf(parseEngInput("1 a", { baseUnit: "A" }))).toBe(1e-18);
    expect(parseEngInput("1 S", { baseUnit: "s" })).toEqual({ ok: false, reason: "unit-mismatch" });
    expect(parseEngInput("1 s", { baseUnit: "S" })).toEqual({ ok: false, reason: "unit-mismatch" });
  });

  it("keeps logarithmic units unscaled", () => {
    expect(valueOf(parseEngInput("12.5 dBm", { baseUnit: "dBm" }))).toBe(12.5);
    expect(valueOf(parseEngInput("-3 DBV"))).toBe(-3);
    expect(parseEngInput("1 mdB", { baseUnit: "dB" })).toEqual({ ok: false, reason: "unknown-unit" });
    expect(parseEngInput("10 dBm", { baseUnit: "dBW" })).toEqual({ ok: false, reason: "unit-mismatch" });
    expect(parseEngInput("10 dB", { baseUnit: "dBm" })).toEqual({ ok: false, reason: "unit-mismatch" });
  });

  it("reports malformed, unknown, ambiguous, mismatched and out-of-range input", () => {
    expect(parseEngInput("" )).toEqual({ ok: false, reason: "empty" });
    expect(parseEngInput("1 42 MHz")).toEqual({ ok: false, reason: "invalid-number" });
    expect(parseEngInput("1 MHz trailing")).toEqual({ ok: false, reason: "invalid-number" });
    expect(parseEngInput("1 xyz")).toEqual({ ok: false, reason: "unknown-unit" });
    expect(parseEngInput("1M")).toEqual({ ok: false, reason: "missing-prefix-context" });
    expect(parseEngInput("1 s", { baseUnit: "Hz" })).toEqual({ ok: false, reason: "unit-mismatch" });
    expect(parseEngInput("NaN")).toEqual({ ok: false, reason: "non-finite" });
    expect(parseEngInput("Infinity")).toEqual({ ok: false, reason: "non-finite" });
    expect(parseEngInput("1e309")).toEqual({ ok: false, reason: "non-finite" });
    expect(parseEngInput("1e-400")).toEqual({ ok: false, reason: "overflow" });
    expect(parseEngInput("0e-400")).toEqual({ ok: true, value: 0 });
    expect(parseEngInput("1e308 THz")).toEqual({ ok: false, reason: "overflow" });
    expect(parseEngInput("1e-308 qHz")).toEqual({ ok: false, reason: "overflow" });
  });
});
