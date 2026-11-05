import { describe, expect, it, vi } from "vitest";
import { parseMeasurementFile } from "../../src/domain/parsers/parse-file";
import { resetParserFileCounter } from "../../src/domain/parsers/rs-dat";
import { defaultFileState, fileReducer } from "../../src/stores/file-store";
import { defaultMarkerState, markerReducer } from "../../src/stores/marker-store";
import { defaultRefLineState, refLineReducer } from "../../src/stores/ref-line-store";
import { makeTestTrace } from "./helpers";

describe("additional reducer behavior", () => {
  it("file reducer directly stores known-good parsed files", () => {
    resetParserFileCounter();
    const parsed = parseMeasurementFile("Time,CH1\n0,1\n1,2\n", "known.csv");
    const state = fileReducer(defaultFileState, {
      type: "ADD_PARSED_FILE",
      payload: { id: "known", fileName: "known.csv", parsed, text: "Time,CH1\n0,1\n1,2\n" },
    });

    expect(state.files).toHaveLength(1);
    expect(Object.values(state.vis)).toEqual([true]);
    expect(state.rawFileData.known).toContain("Time,CH1");
  });

  it("file reducer hides and restores display traces while updating visibility", () => {
    resetParserFileCounter();
    const parsed = parseMeasurementFile("Time,CH1\n0,1\n1,2\n", "known.csv");
    const added = fileReducer(defaultFileState, {
      type: "ADD_PARSED_FILE",
      payload: { id: "known", fileName: "known.csv", parsed, text: "Time,CH1\n0,1\n1,2\n" },
    });
    const displayTraceId = added.files[0]?.displayTraces?.[0]?.id;
    const legacyName = added.files[0]?.displayTraces?.[0]?.compat?.legacyTraceName;

    expect(displayTraceId).toBeTruthy();
    expect(legacyName).toBeTruthy();

    const hidden = fileReducer(added, {
      type: "SET_DISPLAY_TRACE_HIDDEN",
      payload: { fileId: "known", displayTraceId: displayTraceId!, hidden: true },
    });
    expect(hidden.vis[legacyName!]).toBeUndefined();

    const shown = fileReducer(hidden, {
      type: "SHOW_ALL_DISPLAY_TRACES",
      payload: { fileId: "known" },
    });
    expect(shown.vis[legacyName!]).toBe(true);
  });

  it("marker reducer places, removes, and rewires delta references", () => {
    const trace = makeTestTrace();
    const first = markerReducer(defaultMarkerState, {
      type: "PLACE_MARKER",
      payload: { trace, targetFreq: 5 },
    });
    const withDelta = markerReducer(first, {
      type: "PLACE_MARKER",
      payload: { trace, targetFreq: 15, markerType: "delta", refIdx: 0 },
    });
    const removedRef = markerReducer(withDelta, { type: "REMOVE_MARKER", payload: 0 });

    expect(first.markers[0]).toMatchObject({ freq: 0, amp: 0, trace: trace.name });
    expect(withDelta.markers[1]).toMatchObject({ type: "delta", refIdx: 0 });
    expect(removedRef.markers[0]).toMatchObject({ type: "delta", refIdx: null });
    expect(removedRef.selectedMkrIdx).toBe(0);
  });

  it("ref-line reducer locks, moves, unlocks, and cleans pane-scoped lines", () => {
    vi.spyOn(Date, "now").mockReturnValue(5000);
    const added = refLineReducer(defaultRefLineState, {
      type: "ADD_LINE",
      payload: { id: 1, type: "v", paneId: "pane-1", groupId: null, value: 10, label: "V1" },
    });
    const locked = refLineReducer(added, {
      type: "LOCK_LINE",
      payload: { lineId: 1, allPaneIds: ["pane-1", "pane-2", "pane-3"] },
    });
    const moved = refLineReducer(locked, {
      type: "MOVE_GROUP",
      payload: { groupId: "5000", value: 20 },
    });
    const unlocked = refLineReducer(moved, {
      type: "UNLOCK_LINE",
      payload: { lineId: 1 },
    });
    const cleaned = refLineReducer(unlocked, {
      type: "CLEANUP_ORPHANED_LINES",
      payload: { paneIds: ["pane-1"] },
    });

    expect(locked.refLines).toHaveLength(3);
    expect(moved.refLines.every((line) => line.value === 20)).toBe(true);
    expect(unlocked.refLines.every((line) => line.groupId === null)).toBe(true);
    expect(cleaned.refLines).toHaveLength(1);
  });
});
