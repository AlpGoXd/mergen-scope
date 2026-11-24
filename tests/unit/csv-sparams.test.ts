import { describe, expect, it } from "vitest";
import { parseForImport } from "../../src/domain/parsers/parse-file";
import { parseTabularFile } from "../../src/domain/parsers/tabular";
import { detectSParameterNetwork, detectTabular } from "../../src/domain/parsers/tabular-detect";
import { parseTouchstoneFile } from "../../src/domain/parsers/touchstone";
import {
  hasNonIncreasingFrequencies,
  networkOverviewPlot,
  readNumericTable,
  wizardBlocker,
  wizardLayout,
} from "../../src/domain/import-wizard";
import { initialWorkspaceEngine, workspaceEngineReducer } from "../../src/stores/aggregate-workspace-store";
import type { WizardConfig } from "../../src/types/file";

describe("CSV / Tabular S-parameter parsing", () => {
  it("parses 1-port RI CSV into a TouchstoneNetwork with cellOrder='spec'", () => {
    const csv = [
      "Frequency (Hz),Re(S11),Im(S11)",
      "1000000000,0.2,-0.1",
      "2000000000,-0.3,0.4",
    ].join("\n");

    const parsed = parseTabularFile(csv, "oneport.csv", null);
    expect(parsed.format).toBe("touchstone");
    expect(parsed.traces).toEqual([]);
    expect(parsed.displayTraces).toEqual([]);
    expect(parsed.datasets).toHaveLength(1);
    expect(parsed.datasets?.[0]?.family).toBe("network");
    expect(parsed.meta).toEqual({
      "Format": "CSV (S-parameters)",
      "Port Count": "1",
      "Data Format": "RI",
      "Reference": "50",
    });

    const net = parsed.touchstoneNetwork;
    expect(net).toBeDefined();
    expect(net?.parameterType).toBe("S");
    expect(net?.portCount).toBe(1);
    expect(net?.dataFormat).toBe("RI");
    expect(net?.referenceOhms).toEqual([50]);
    expect(net?.cellOrder).toBe("spec");
    expect(net?.samples).toHaveLength(2);
    expect(net?.samples[0]?.freq).toBe(1e9);
    expect(net?.samples[0]?.sMatrix[0]?.[0]).toEqual({ re: 0.2, im: -0.1 });
    expect(net?.samples[1]?.freq).toBe(2e9);
    expect(net?.samples[1]?.sMatrix[0]?.[0]).toEqual({ re: -0.3, im: 0.4 });
  });

  it("parses 2-port DB with degrees and partial mapping (S11 + S21 only)", () => {
    const csv = [
      "Frequency (GHz),S11 dB,S11 ang,S21 dB,S21 ang",
      "1.0,-20,90,-3,-45",
      "2.0,-14,0,-6,-90",
    ].join("\n");

    const parsed = parseTabularFile(csv, "two_port_partial.csv", null);
    expect(parsed.format).toBe("touchstone");
    expect(parsed.meta).toEqual({
      "Format": "CSV (S-parameters)",
      "Port Count": "2",
      "Data Format": "DB",
      "Reference": "50",
      "Not in file": "S12, S22",
    });

    const net = parsed.touchstoneNetwork;
    expect(net?.portCount).toBe(2);
    expect(net?.dataFormat).toBe("DB");
    expect(net?.freqUnit).toBe("GHz");
    expect(net?.cellOrder).toBe("spec");
    const s0 = net?.samples[0];
    expect(s0?.freq).toBeCloseTo(1e9, 3);
    // -20 dB @ 90 deg -> mag 0.1 @ 90 deg -> 0 + 0.1j
    expect(s0?.sMatrix[0]?.[0]?.re).toBeCloseTo(0, 12);
    expect(s0?.sMatrix[0]?.[0]?.im).toBeCloseTo(0.1, 12);
    // -3 dB @ -45 deg
    const mag21 = Math.pow(10, -3 / 20);
    expect(s0?.sMatrix[1]?.[0]?.re).toBeCloseTo(mag21 * Math.cos(-Math.PI / 4), 12);
    expect(s0?.sMatrix[1]?.[0]?.im).toBeCloseTo(mag21 * Math.sin(-Math.PI / 4), 12);
    // Unmapped S12, S22 are 0+0j
    expect(s0?.sMatrix[0]?.[1]).toEqual({ re: 0, im: 0 });
    expect(s0?.sMatrix[1]?.[1]).toEqual({ re: 0, im: 0 });
  });

  it("parses MA with radians and converts angles accurately", () => {
    const csv = [
      "Freq (MHz),S11_Mag,S11_Phase (rad)",
      `100,0.5,${Math.PI / 2}`,
      `200,0.25,${Math.PI}`,
    ].join("\n");

    const parsed = parseTabularFile(csv, "ma_rad.csv", null);
    expect(parsed.format).toBe("touchstone");
    expect(parsed.suggestedConfig?.network?.angleUnit).toBe("rad");
    const net = parsed.touchstoneNetwork;
    expect(net?.dataFormat).toBe("MA");
    expect(net?.samples[0]?.freq).toBeCloseTo(100e6, 3);
    expect(net?.samples[0]?.sMatrix[0]?.[0]?.re).toBeCloseTo(0, 12);
    expect(net?.samples[0]?.sMatrix[0]?.[0]?.im).toBeCloseTo(0.5, 12);
    expect(net?.samples[1]?.sMatrix[0]?.[0]?.re).toBeCloseTo(-0.25, 12);
    expect(net?.samples[1]?.sMatrix[0]?.[0]?.im).toBeCloseTo(0, 12);
  });

  it("parses semicolon-separated CSV with decimal commas and skips unparseable rows", () => {
    const csv = [
      "Instrument;VNA",
      "freq;S11 dB;S11 ang;S21 dB;S21 ang",
      "1000000;-10,5;45,0;-1,2;-30,5",
      "bad;row;here;x;y",
      "2000000;-11,0;;-1,3;-35,0",
      "3000000;-12,5;30,0;-1,5;-40,0",
    ].join("\n");

    const parsed = parseTabularFile(csv, "eu_vna.csv", null);
    expect(parsed.format).toBe("touchstone");
    expect(parsed.suggestedConfig?.delimiter).toBe(";");
    expect(parsed.suggestedConfig?.skipRows).toBe(2);
    expect(parsed.touchstoneNetwork?.samples).toHaveLength(2);
    expect(parsed.touchstoneNetwork?.samples[0]?.freq).toBe(1e6);
    expect(parsed.touchstoneNetwork?.samples[1]?.freq).toBe(3e6);

    const mag0 = Math.pow(10, -10.5 / 20);
    const ang0 = (45 * Math.PI) / 180;
    expect(parsed.touchstoneNetwork?.samples[0]?.sMatrix[0]?.[0]?.re).toBeCloseTo(mag0 * Math.cos(ang0), 12);
    expect(parsed.touchstoneNetwork?.samples[0]?.sMatrix[0]?.[0]?.im).toBeCloseTo(mag0 * Math.sin(ang0), 12);
  });

  it("matches parseTouchstoneFile S-matrices within 1e-12 for identical 2-port data", () => {
    const s2p = [
      "! 2-port reference network",
      "# GHz S DB R 50",
      "1.0 -12.5 35.0 -1.2 -42.0 -28.0 110.0 -14.0 -25.0",
      "2.5 -10.0 -15.0 -2.4 -85.0 -24.5 75.0 -11.5 -55.0",
      "5.0 -8.5 -70.0 -4.1 -130.0 -21.0 30.0 -9.0 -95.0",
    ].join("\n");

    const csv = [
      "Frequency (GHz),S11 dB,S11 ang,S21 dB,S21 ang,S12 dB,S12 ang,S22 dB,S22 ang",
      "1.0,-12.5,35.0,-1.2,-42.0,-28.0,110.0,-14.0,-25.0",
      "2.5,-10.0,-15.0,-2.4,-85.0,-24.5,75.0,-11.5,-55.0",
      "5.0,-8.5,-70.0,-4.1,-130.0,-21.0,30.0,-9.0,-95.0",
    ].join("\n");

    const ts = parseTouchstoneFile(s2p, "ref.s2p").touchstoneNetwork;
    const cs = parseTabularFile(csv, "ref.csv", null).touchstoneNetwork;

    expect(ts).toBeDefined();
    expect(cs).toBeDefined();
    expect(cs?.portCount).toBe(ts?.portCount);
    expect(cs?.samples).toHaveLength(ts?.samples.length ?? 0);

    for (let i = 0; i < (ts?.samples.length ?? 0); i++) {
      const tsSample = ts?.samples[i];
      const csSample = cs?.samples[i];
      expect(csSample?.freq).toBeCloseTo(tsSample?.freq ?? 0, 12);
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          const tsVal = tsSample?.sMatrix[r]?.[c];
          const csVal = csSample?.sMatrix[r]?.[c];
          expect(Math.abs((csVal?.re ?? 0) - (tsVal?.re ?? 0))).toBeLessThan(1e-12);
          expect(Math.abs((csVal?.im ?? 0) - (tsVal?.im ?? 0))).toBeLessThan(1e-12);
        }
      }
    }
  });

  it("throws clear errors on invalid configs or non-increasing frequencies", () => {
    const baseCsv = "Freq (Hz),S11 Re,S11 Im,S21 Re,S21 Im\n1e9,0.1,0.2,0.8,-0.1\n2e9,0.2,0.1,0.7,-0.2\n";
    const baseCfg = detectTabular(baseCsv).config;
    const baseNet = baseCfg.network;
    if (!baseNet) throw new Error("expected detected network config");

    // Non-increasing frequencies
    const unsortedCsv = "Freq (Hz),S11 Re,S11 Im\n2e9,0.1,0.2\n1e9,0.2,0.1\n";
    expect(() => parseTabularFile(unsortedCsv, "unsorted.csv", null)).toThrow(/strictly increasing/i);

    const dupFreqCsv = "Freq (Hz),S11 Re,S11 Im\n1e9,0.1,0.2\n1e9,0.2,0.1\n";
    expect(() => parseTabularFile(dupFreqCsv, "dupfreq.csv", null)).toThrow(/strictly increasing/i);

    // referenceOhms <= 0
    expect(() =>
      parseTabularFile(baseCsv, "bad_z0.csv", {
        ...baseCfg,
        network: { ...baseNet, referenceOhms: 0 },
      }),
    ).toThrow(/reference impedance/i);

    // Duplicate cell
    expect(() =>
      parseTabularFile(baseCsv, "dup_cell.csv", {
        ...baseCfg,
        network: {
          ...baseNet,
          cells: [
            { row: 0, col: 0, first: 1, second: 2 },
            { row: 0, col: 0, first: 3, second: 4 },
          ],
        },
      }),
    ).toThrow(/duplicate.*cell/i);

    // Out-of-range row/col
    expect(() =>
      parseTabularFile(baseCsv, "oob_cell.csv", {
        ...baseCfg,
        network: {
          ...baseNet,
          portCount: 1,
          cells: [{ row: 1, col: 0, first: 1, second: 2 }],
        },
      }),
    ).toThrow(/out of range/i);

    // Out-of-range column index
    expect(() =>
      parseTabularFile(baseCsv, "oob_col.csv", {
        ...baseCfg,
        network: {
          ...baseNet,
          portCount: 1,
          cells: [{ row: 0, col: 0, first: 1, second: 9 }],
        },
      }),
    ).toThrow(/out of range/i);

    // Duplicate column index
    expect(() =>
      parseTabularFile(baseCsv, "dup_col.csv", {
        ...baseCfg,
        network: {
          ...baseNet,
          portCount: 2,
          cells: [
            { row: 0, col: 0, first: 1, second: 2 },
            { row: 1, col: 0, first: 2, second: 3 },
          ],
        },
      }),
    ).toThrow(/more than once/i);

    // Same column as xCol
    expect(() =>
      parseTabularFile(baseCsv, "xcol_overlap.csv", {
        ...baseCfg,
        network: {
          ...baseNet,
          portCount: 1,
          cells: [{ row: 0, col: 0, first: 0, second: 2 }],
        },
      }),
    ).toThrow(/more than once/i);

    // Empty cells
    expect(() =>
      parseTabularFile(baseCsv, "empty_cells.csv", {
        ...baseCfg,
        network: { ...baseNet, cells: [] },
      }),
    ).toThrow(/at least one/i);

    // No valid rows
    const headerOnly = "Freq (Hz),S11 Re,S11 Im\n";
    expect(() =>
      parseTabularFile(headerOnly, "empty_rows.csv", {
        ...baseCfg,
        skipRows: 1,
      }),
    ).toThrow(/no valid s-parameter data rows/i);
  });
});

describe("CSV S-parameter auto-detection", () => {
  it("recognizes all standard S-parameter header conventions", () => {
    const cases: {
      name: string;
      headers: string;
      delimiter: string;
      colCount: number;
      format: "RI" | "MA" | "DB";
      angleUnit: "deg" | "rad";
      portCount: 1 | 2 | 3 | 4;
    }[] = [
      { name: "S11 Re / Im", headers: "Frequency (Hz),S11 Re,S11 Im", delimiter: ",", colCount: 3, format: "RI", angleUnit: "deg", portCount: 1 },
      { name: "quoted S(1,1) dB / ang", headers: 'Frequency,"S(1,1) dB","S(1,1) ang"', delimiter: ",", colCount: 3, format: "DB", angleUnit: "deg", portCount: 1 },
      { name: "semicolon S(1,1) dB / ang", headers: "Frequency;S(1,1) dB;S(1,1) ang", delimiter: ";", colCount: 3, format: "DB", angleUnit: "deg", portCount: 1 },
      { name: "Re(S11) / Im(S11)", headers: "Frequency,Re(S11),Im(S11)", delimiter: ",", colCount: 3, format: "RI", angleUnit: "deg", portCount: 1 },
      { name: "S11_Real / S11_Imag", headers: "Freq,S11_Real,S11_Imag", delimiter: ",", colCount: 3, format: "RI", angleUnit: "deg", portCount: 1 },
      { name: "S11_Mag / S11_Phase (rad)", headers: "Freq,S11_Mag,S11_Phase (rad)", delimiter: ",", colCount: 3, format: "MA", angleUnit: "rad", portCount: 1 },
      { name: "S11 LogMag / deg + S21", headers: "Freq,S11 LogMag,S11 deg,S21 LogMag,S21 deg", delimiter: ",", colCount: 5, format: "DB", angleUnit: "deg", portCount: 2 },
      { name: "S11 LinMag / arg + S31", headers: "Freq,S11 LinMag,S11 arg,S31 LinMag,S31 arg", delimiter: ",", colCount: 5, format: "MA", angleUnit: "deg", portCount: 3 },
      { name: "4-port sparse S44", headers: "Freq,S11 Re,S11 Im,S44 Re,S44 Im", delimiter: ",", colCount: 5, format: "RI", angleUnit: "deg", portCount: 4 },
    ];

    for (const tc of cases) {
      const row1 = ["1e9", ...Array(tc.colCount - 1).fill("0.5")].join(tc.delimiter);
      const row2 = ["2e9", ...Array(tc.colCount - 1).fill("0.4")].join(tc.delimiter);
      const csv = `${tc.headers}\n${row1}\n${row2}\n`;
      const detected = detectTabular(csv);
      expect(detected.config.network, tc.name).toBeDefined();
      expect(detected.config.network?.format, tc.name).toBe(tc.format);
      expect(detected.config.network?.angleUnit, tc.name).toBe(tc.angleUnit);
      expect(detected.config.network?.portCount, tc.name).toBe(tc.portCount);
      expect(detected.config.domain, tc.name).toBe("frequency");
    }
  });

  it("caps port count at 4 if higher port indices appear in headers", () => {
    const net = detectSParameterNetwork(
      ["Freq", "S11 Re", "S11 Im", "S51 Re", "S51 Im"],
      [0, 1, 2, 3, 4],
      0,
    );
    expect(net?.portCount).toBe(4);
    expect(net?.cells).toEqual([{ row: 0, col: 0, first: 1, second: 2 }]);
  });

  it("keeps ordinary scalar CSVs and unpaired S-column CSVs in scalar trace mode", () => {
    const powerCsv = "Frequency,Power dBm\n1000000,-30\n2000000,-28\n";
    expect(detectTabular(powerCsv).config.network).toBeUndefined();

    const scalarS11Csv = "Frequency (Hz),S11,S21\n1000000,-15,-1\n2000000,-18,-2\n";
    expect(detectTabular(scalarS11Csv).config.network).toBeUndefined();
  });

  it("opens S-parameter CSVs via parseForImport with network pre-filled", () => {
    const csv = "Frequency (GHz),S11 Re,S11 Im,S21 Re,S21 Im\n1.0,0.1,0.0,0.9,0.0\n2.0,0.2,0.0,0.8,0.0\n";
    const result = parseForImport(csv, "filter.csv");
    expect(result.format).toBe("needs-import-wizard");
    expect(result.suggestedConfig?.network).toEqual({
      portCount: 2,
      format: "RI",
      angleUnit: "deg",
      referenceOhms: 50,
      cells: [
        { row: 0, col: 0, first: 1, second: 2 },
        { row: 1, col: 0, first: 3, second: 4 },
      ],
    });
  });
});

describe("wizard preview and workspace edit integration for S-parameters", () => {
  it("builds preview plot for |S11| in dB and validates blockers", () => {
    const csv = [
      "freq;S11 dB;S11 ang;S21 dB;S21 ang",
      "1000000;-10,5;45,0;-1,2;-30,5",
      "2000000;-20,0;0,0;-1,5;-60,0",
    ].join("\n");
    const detected = detectTabular(csv);
    const network = detected.config.network;
    if (!network) throw new Error("expected detected network");
    const layout = wizardLayout(csv, detected.config);
    expect(wizardBlocker(detected.config, layout)).toBeNull();

    const table = readNumericTable(layout.lines, detected.config, detected.config.skipRows, layout.headers.length);
    expect(hasNonIncreasingFrequencies(table, detected.config.xCol)).toBe(false);

    const plot = networkOverviewPlot(table, detected.config.xCol, network, 10);
    expect(plot.xRange).toEqual({ min: 1e6, max: 2e6 });
    expect(plot.yRange?.min).toBeCloseTo(-20, 6);
    expect(plot.yRange?.max).toBeCloseTo(-10.5, 6);
    expect(plot.series[0]?.[0]?.length).toBe(2);

    const invalidZ0: WizardConfig = {
      ...detected.config,
      network: { ...network, referenceOhms: -50 },
    };
    expect(wizardBlocker(invalidZ0, layout)).toMatch(/Z₀/);
  });

  it("imports and re-edits S-parameter CSV through workspaceEngineReducer", () => {
    const csv = "Frequency (GHz),S11 Re,S11 Im,S21 Re,S21 Im\n1.0,0.1,0.0,0.9,0.0\n2.0,0.2,0.0,0.8,0.0\n";
    const parsed = parseForImport(csv, "dut.csv");
    let engine = workspaceEngineReducer(initialWorkspaceEngine(), {
      type: "change",
      command: { slice: "open-data", inputs: [{ id: "dut-1", name: "dut.csv", text: csv, parsed }], limit: 4 },
    });
    const queued = engine.present.files.wizardQueue[0];
    const suggested = queued?.suggestedConfig;
    if (!suggested?.network) throw new Error("expected queued wizard config with network");
    expect(suggested.network.portCount).toBe(2);

    engine = workspaceEngineReducer(engine, {
      type: "change",
      command: { slice: "files", limit: 4, action: { type: "RESOLVE_WIZARD", payload: { id: "dut-1", config: suggested } } },
    });
    expect(engine.present.files.wizardQueue).toHaveLength(0);
    const file = engine.present.files.files[0];
    expect(file?.format).toBe("touchstone");
    expect(file?.touchstoneNetwork?.portCount).toBe(2);
    expect(file?.touchstoneNetwork?.cellOrder).toBe("spec");
    expect(file?.wizardConfig?.network).toEqual(suggested.network);

    engine = workspaceEngineReducer(engine, {
      type: "change",
      command: { slice: "files", action: { type: "RERUN_WIZARD", payload: { fileId: String(file?.id), fileName: "dut.csv" } } },
    });
    const editEntry = engine.present.files.wizardQueue[0];
    expect(editEntry?.mode).toBe("edit");
    expect(editEntry?.suggestedConfig?.network).toEqual(suggested.network);
  });
});
