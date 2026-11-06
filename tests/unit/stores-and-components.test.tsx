import React, { useEffect } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportWizardModal } from "../../src/components/wizard/ImportWizardModal";
import { StoreRoot } from "../../src/stores/StoreRoot";
import { defaultFileState, fileReducer, useFileDispatch, useFileState } from "../../src/stores/file-store";
import { defaultPaneState, paneReducer } from "../../src/stores/pane-store";
import { makeTestTrace } from "./helpers";

function FileProbe() {
  const state = useFileState();
  return (
    <div>
      <div data-testid="file-count">{state.files.length}</div>
      <div data-testid="wizard-count">{state.wizardQueue.length}</div>
    </div>
  );
}

function QueueFile({ fileName, rawText }: { fileName: string; rawText: string }) {
  const dispatch = useFileDispatch();
  useEffect(() => {
    dispatch({ type: "QUEUE_WIZARD", payload: { id: "fixture", fileName, rawText } });
  }, [dispatch, fileName, rawText]);
  return null;
}

describe("store and component behavior", () => {
  it("file reducer queues ambiguous parser inputs for the wizard", () => {
    const state = fileReducer(defaultFileState, {
      type: "QUEUE_WIZARD",
      payload: { id: "ambiguous", fileName: "ambiguous.csv", rawText: "1,2\n2,3\n" },
    });

    expect(state.files).toHaveLength(0);
    expect(state.wizardQueue).toHaveLength(1);
    expect(state.wizardQueue[0]?.suggestedConfig?.confidence).toBeLessThan(0.8);
  });

  it("pane reducer assigns compatible traces and rejects mixed domains", () => {
    const frequencyTrace = makeTestTrace({ name: "freq" });
    const timeTrace = makeTestTrace({ name: "time", domain: "time", family: "waveform", units: { x: "s", y: "V" } });
    const assigned = paneReducer(defaultPaneState, {
      type: "ASSIGN_TRACE_TO_PANE",
      payload: { trace: frequencyTrace, targetPaneId: "pane-1", allTraces: [frequencyTrace] },
    });
    const rejected = paneReducer(assigned, {
      type: "ASSIGN_TRACE_TO_PANE",
      payload: { trace: timeTrace, targetPaneId: "pane-1", allTraces: [frequencyTrace, timeTrace] },
    });

    expect(assigned.tracePaneMap[frequencyTrace.name]).toBe("pane-1");
    expect(rejected.tracePaneMap[timeTrace.name]).toBeUndefined();
  });

  it("import wizard can confirm an ambiguous CSV into a parsed file", async () => {
    const user = userEvent.setup();
    render(
      <StoreRoot>
        <QueueFile fileName="ambiguous.csv" rawText={"1,2\n2,3\n"} />
        <ImportWizardModal />
        <FileProbe />
      </StoreRoot>,
    );

    expect(await screen.findByRole("dialog", { name: "Import table" })).toBeInTheDocument();
    expect(screen.getByTestId("wizard-count")).toHaveTextContent("1");

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(screen.getByTestId("file-count")).toHaveTextContent("1"));
    expect(screen.getByTestId("wizard-count")).toHaveTextContent("0");
  });

  it("import wizard can skip an ambiguous input without adding a file", async () => {
    const user = userEvent.setup();
    render(
      <StoreRoot>
        <QueueFile fileName="ambiguous.csv" rawText={"1,2\n2,3\n"} />
        <ImportWizardModal />
        <FileProbe />
      </StoreRoot>,
    );

    expect(await screen.findByRole("dialog", { name: "Import table" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Skip" }));

    await waitFor(() => expect(screen.getByTestId("wizard-count")).toHaveTextContent("0"));
    expect(screen.getByTestId("file-count")).toHaveTextContent("0");
  });
});
