import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { adaptDisplayTracesToLegacyTraces } from "../../src/domain/display-trace-adapter";
import { reconcileDerivedTraceGraph, recomputeDerivedTraces } from "../../src/domain/derived-state";
import { makeDefaultTouchstoneState, reconcileTouchstoneFileSelections } from "../../src/domain/touchstone/selections";
import type { DerivedTrace } from "../../src/types/trace";
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
    // A .dat name gives no port count; the Touchstone parser reads it from the 9-number data rows.
    expect(parseMeasurementFile(text, "net.dat").touchstoneNetwork?.portCount).toBe(2);
    expect(parseMeasurementFile(text.replace("R 50", "R 50 ! calibrated"), "net.dat").touchstoneNetwork?.portCount).toBe(2);
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

  it("preserves identities, visibility and derived data when re-importing matching columns", () => {
    const added = fileReducer(defaultFileState, {
      type: "QUEUE_WIZARD",
      payload: { id: "table", fileName: "table.csv", rawText: "Time,CH1,CH2\n0,1,10\n1,2,20\n2,3,30\n" },
    });
    const original = added.files[0];
    if (!original?.datasets || !original.displayTraces) throw new Error("Expected tabular datasets");
    const source = adaptDisplayTracesToLegacyTraces(original.datasets, original.displayTraces, original)[0];
    if (!source) throw new Error("Expected source trace");
    const derived: DerivedTrace = { ...source, id: "derived", kind: "derived", name: "derived", sourceTraceIds: [source.id], operationType: "offset", parameters: { offset: 5 }, data: source.data.map((point) => ({ ...point, amp: point.amp + 5 })) };
    const hidden = fileReducer(added, { type: "SET_VISIBILITY", payload: { traceName: source.name, visible: false } });
    const rerun = fileReducer(hidden, { type: "RERUN_WIZARD", payload: { fileId: "table", fileName: "table.csv" } });
    const config = rerun.wizardQueue[0]?.suggestedConfig;
    if (!config) throw new Error("Expected wizard config");
    const result = fileReducer(rerun, { type: "RESOLVE_WIZARD", payload: { id: "table", config: { ...config, yMult: 2 } } });
    const updated = result.files[0];
    if (!updated?.datasets || !updated.displayTraces) throw new Error("Expected updated datasets");
    expect(updated.traces.map(({ id, name }) => ({ id, name }))).toEqual(original.traces.map(({ id, name }) => ({ id, name })));
    expect(result.vis[source.name]).toBe(false);
    const raw = adaptDisplayTracesToLegacyTraces(updated.datasets, updated.displayTraces, updated);
    const kept = reconcileDerivedTraceGraph(raw, [derived], []).kept;
    expect(kept).toHaveLength(1);
    expect(recomputeDerivedTraces(raw, kept)[0]?.data.map((point) => point.amp)).toEqual([7, 9, 11]);
  });

  it("drops only the removed column on re-import", () => {
    const added = fileReducer(defaultFileState, { type: "QUEUE_WIZARD", payload: { id: "table", fileName: "table.csv", rawText: "Time,CH1,CH2\n0,1,10\n1,2,20\n" } });
    const original = added.files[0];
    if (!original) throw new Error("Expected file");
    const rerun = fileReducer(added, { type: "RERUN_WIZARD", payload: { fileId: "table", fileName: "table.csv" } });
    const config = rerun.wizardQueue[0]?.suggestedConfig;
    if (!config) throw new Error("Expected wizard config");
    const result = fileReducer(rerun, { type: "RESOLVE_WIZARD", payload: { id: "table", config: { ...config, yCols: [2] } } });
    expect(result.files[0]?.traces.map(({ id, name }) => ({ id, name }))).toEqual(original.traces.slice(1).map(({ id, name }) => ({ id, name })));
    expect(result.vis[original.traces[0]?.name ?? ""]).toBeUndefined();
  });

  it("uses disjoint Touchstone trace names for files with the same name", () => {
    const text = readFileSync("test files/cascaded chain.s2p", "utf8");
    let state = defaultFileState;
    for (const id of ["first", "second"]) {
      state = fileReducer(state, { type: "ADD_PARSED_FILE", payload: { id, fileName: "cascaded chain.s2p", parsed: parseMeasurementFile(text, "cascaded chain.s2p"), text } });
    }
    const files = state.files.map((file) => reconcileTouchstoneFileSelections(file, makeDefaultTouchstoneState(file)));
    const firstNames = new Set(files[0]?.traces.map((trace) => trace.name));
    expect(firstNames.size).toBeGreaterThan(0);
    expect(files[1]?.traces.every((trace) => !firstNames.has(trace.name))).toBe(true);
    expect(files[0]?.traces.map((trace) => trace.dn)).toEqual(files[1]?.traces.map((trace) => trace.dn));
  });

  it("rejects JSON that is not a workspace", () => {
    expect(restoreSnapshot("{}")).toBeNull();
    expect(restoreSnapshot("[]")).toBeNull();
    expect(restoreSnapshot("null")).toBeNull();
    expect(restoreSnapshot('{"name":"package.json"}')).toBeNull();
    expect(restoreSnapshot('{"version":1}')).toBeNull();
  });
});
