import { describe, expect, it } from "vitest";
import { parseMeasurementFile } from "../../src/domain/parsers/parse-file";
import { resetParserFileCounter } from "../../src/domain/parsers/rs-dat";
import { summarizeTabularPreview } from "../../src/domain/parsers/tabular";
import { restoreSnapshot } from "../../src/domain/workspace-serialize";
import { defaultFileState, fileReducer } from "../../src/stores/file-store";

const TWO_TRACE_DAT = [
  "Type;FSW;",
  "Start;1000000;Hz;",
  "Stop;2000000;Hz;",
  "Trace;1;",
  "Trace Mode;Clear Write;",
  "Values;3;",
  "1000000;-10;",
  "1500000;-11;",
  "2000000;-12;",
  "Trace;2;",
  "Trace Mode;Max Hold;",
  "Values;3;",
  "1000000;-20;",
  "1500000;-21;",
  "2000000;-22;",
].join("\n");

const AMBIGUOUS_CSV = "a,b\n1,2\n3,4\n5,6\n";

describe("import robustness", () => {
  it("keeps every trace of a multi-trace R&S DAT file", () => {
    resetParserFileCounter();
    const parsed = parseMeasurementFile(TWO_TRACE_DAT, "two.dat");

    expect(parsed.format).toBe("rs-dat");
    expect(parsed.traces).toHaveLength(2);
    expect(parsed.traces.map((trace) => trace.data[0]?.amp)).toEqual([-10, -20]);
  });

  it("does not send a .dat with a '#' comment header to the Touchstone parser", () => {
    resetParserFileCounter();
    const parsed = parseMeasurementFile(`# exported by instrument\n${TWO_TRACE_DAT}`, "commented.dat");

    expect(parsed.format).toBe("rs-dat");
    expect(parsed.traces).toHaveLength(2);
  });

  it("still treats a real Touchstone option line as Touchstone", () => {
    const text = "# GHz S MA R 50\n1 0.5 10 0.1 20 0.1 30 0.5 40\n2 0.5 10 0.1 20 0.1 30 0.5 40\n";
    // A .dat name gives no port count, so reaching the Touchstone parser shows up as its port-count error.
    expect(() => parseMeasurementFile(text, "net.dat")).toThrow(/Touchstone/);
    expect(() => parseMeasurementFile(text.replace("R 50", "R 50 ! calibrated"), "net.dat")).toThrow(/Touchstone/);
  });

  it("summarizes what the wizard settings would read from the preview", () => {
    const lines = ["meta line", "Freq,A,B", "1,2,3", "5,6,7", "x,8,9"];
    expect(summarizeTabularPreview(lines, { delimiter: ",", skipRows: 2, xCol: 0 })).toEqual({ dataRows: 2, xMin: 1, xMax: 5 });
    expect(summarizeTabularPreview(lines, { delimiter: ";", skipRows: 2, xCol: 1 }).dataRows).toBe(0);
  });

  it("turns a parser exception into an import error instead of throwing", () => {
    const state = fileReducer(defaultFileState, {
      type: "QUEUE_WIZARD",
      payload: { id: "bad", fileName: "broken.s2p", rawText: "this is not a network file" },
    });

    expect(state.files).toHaveLength(0);
    expect(state.importErrors).toHaveLength(1);
    expect(state.importErrors[0]?.fileName).toBe("broken.s2p");

    const dismissed = fileReducer(state, { type: "DISMISS_IMPORT_ERROR", payload: { id: state.importErrors[0]!.id } });
    expect(dismissed.importErrors).toHaveLength(0);
  });

  it("reports a file without data instead of adding an empty file", () => {
    const state = fileReducer(defaultFileState, {
      type: "QUEUE_WIZARD",
      payload: { id: "empty", fileName: "empty.dat", rawText: "Type;FSW;\n" },
    });

    expect(state.files).toHaveLength(0);
    expect(state.importErrors[0]?.message).toMatch(/no data/i);
  });

  it("clamps invalid wizard start rows instead of crashing", () => {
    const queued = fileReducer(defaultFileState, {
      type: "QUEUE_WIZARD",
      payload: { id: "amb", fileName: "amb.csv", rawText: AMBIGUOUS_CSV },
    });
    const entry = queued.wizardQueue[0];
    expect(entry?.suggestedConfig).toBeDefined();

    for (const skipRows of [-1, 1.5, Number.NaN]) {
      const resolved = fileReducer(queued, {
        type: "RESOLVE_WIZARD",
        payload: { id: "amb", config: { ...entry!.suggestedConfig!, skipRows } },
      });
      expect(resolved.wizardQueue).toHaveLength(0);
      expect(resolved.files.length + resolved.importErrors.length).toBe(1);
    }
  });

  it("keeps the original file when a re-import is skipped, and replaces it on confirm", () => {
    resetParserFileCounter();
    const added = fileReducer(defaultFileState, {
      type: "QUEUE_WIZARD",
      payload: { id: "known", fileName: "known.csv", rawText: "Time,CH1\n0,1\n1,2\n2,3\n" },
    });
    expect(added.files).toHaveLength(1);

    const rerun = fileReducer(added, { type: "RERUN_WIZARD", payload: { fileId: "known", fileName: "known.csv" } });
    expect(rerun.files).toHaveLength(1);
    expect(rerun.wizardQueue[0]?.previewLines.length).toBeGreaterThan(0);

    const skipped = fileReducer(rerun, { type: "SKIP_WIZARD", payload: { id: "known" } });
    expect(skipped.files).toEqual(added.files);

    const confirmed = fileReducer(rerun, {
      type: "RESOLVE_WIZARD",
      payload: { id: "known", config: rerun.wizardQueue[0]!.suggestedConfig! },
    });
    expect(confirmed.files).toHaveLength(1);
    expect(confirmed.files[0]).not.toBe(added.files[0]);
    expect(Object.keys(confirmed.vis)).toEqual(confirmed.files[0]!.traces.map((trace) => trace.name));
  });

  it("rejects JSON that is not a workspace", () => {
    expect(restoreSnapshot("{}")).toBeNull();
    expect(restoreSnapshot("[]")).toBeNull();
    expect(restoreSnapshot("null")).toBeNull();
    expect(restoreSnapshot('{"name":"package.json"}')).toBeNull();
    expect(restoreSnapshot('{"version":1}')).toBeNull();
  });
});
