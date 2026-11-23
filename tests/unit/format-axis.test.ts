import { describe, expect, it } from "vitest";
import { formatAdaptiveXAxisTickLabels, formatAdaptiveXAxisValue, formatPerDivision, makeYAxisTickFormatter } from "../../src/domain/format";
import { xAxisLabelForUnit } from "../../src/domain/units";

describe("axis display formatting", () => {
  it("trims adaptive frequency tick labels after duplicate detection", () => {
    expect(formatAdaptiveXAxisTickLabels([1.42e9, 1.4202e9], 2e5, { domain: "frequency" }))
      .toEqual(["1.42G", "1.4202G"]);
  });

  it("formats the declared angle unit even for the legacy frequency trace domain", () => {
    expect(formatAdaptiveXAxisTickLabels([0, 90, 180], 180, { domain: "frequency", unit: "degrees" }))
      .toEqual(["0°", "90°", "180°"]);
    expect(formatAdaptiveXAxisValue(1.57, 3, { domain: "frequency", unit: "radians" })).toBe("1.57 rad");
  });

  it("formats electrical, log, and unitless X axes without falling back to Hz", () => {
    expect(formatAdaptiveXAxisValue(0.025, 0.1, { domain: "frequency", unit: "V" })).toBe("25 mV");
    expect(formatAdaptiveXAxisValue(-10, 20, { domain: "frequency", unit: "dBm" })).toBe("-10 dBm");
    expect(formatAdaptiveXAxisValue(42.5, 100, { domain: "frequency", unit: "unitless" })).toBe("42.5");
    expect(formatAdaptiveXAxisTickLabels([-20, -10, 0], 20, { domain: "frequency", unit: "dBm" })).toEqual(["-20", "-10", "0"]);
    expect(formatAdaptiveXAxisTickLabels([0, 50, 100], 100, { domain: "frequency", unit: "unitless" })).toEqual(["0", "50", "100"]);
    expect(xAxisLabelForUnit("°", "frequency")).toBe("Angle (°)");
    expect(xAxisLabelForUnit("V", "frequency")).toBe("Voltage (V)");
    expect(xAxisLabelForUnit("dBm", "frequency")).toBe("Power (dBm)");
    expect(xAxisLabelForUnit("Ohm", "frequency")).toBe("Impedance (Ω)");
    expect(xAxisLabelForUnit("unitless", "frequency")).toBe("X");
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
