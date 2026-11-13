import { describe, expect, it } from "vitest";
import { formatAdaptiveXAxisTickLabels, formatPerDivision, makeYAxisTickFormatter } from "../../src/domain/format";

describe("axis display formatting", () => {
  it("trims adaptive frequency tick labels after duplicate detection", () => {
    expect(formatAdaptiveXAxisTickLabels([1.42e9, 1.4202e9], 2e5, { domain: "frequency" }))
      .toEqual(["1.42G", "1.4202G"]);
  });

  it("formats per-division steps with SI prefixes except for dB units", () => {
    expect([200000, 0.01, 500, 2.5e-6, 1.5e9].map((step) => formatPerDivision(step)))
      .toEqual(["200k/div", "10m/div", "500/div", "2.5u/div", "1.5G/div"]);
    expect(formatPerDivision(20, "dBm")).toBe("20/div");
    expect(formatPerDivision(2.5, "DBV")).toBe("2.5/div");
  });
});

describe("Y axis tick prefixes", () => {
  it("uses one SI prefix for the whole axis", () => {
    const fmt = makeYAxisTickFormatter({ min: 11000, max: 13000 }, "V");
    expect([11000, 11500, 12250, 13000].map(fmt)).toEqual(["11k", "11.5k", "12.25k", "13k"]);
    expect(makeYAxisTickFormatter({ min: 0, max: 2000 }, "")(1423)).toBe("1.423k");
  });

  it("scales small linear values down", () => {
    const fmt = makeYAxisTickFormatter({ min: 0, max: 0.005 }, "V");
    expect(fmt(0.0025)).toBe("2.5m");
    expect(fmt(0)).toBe("0m");
  });

  it("leaves plain-range values unprefixed and keeps dB values as numbers", () => {
    expect(makeYAxisTickFormatter({ min: -5, max: 10 }, "V")(2.5)).toBe("2.5");
    expect(makeYAxisTickFormatter({ min: -100, max: 1200 }, "dBm")(-35)).toBe("-35.0");
  });
});
