import { expect, type Locator, type Page, test } from "@playwright/test";
import { readFileSync } from "fs";
import { resolve } from "path";

const datFixture = resolve(process.cwd(), "test files/cascade_ip3_-12dBm.DAT");
const touchstoneFixture = resolve(process.cwd(), "test files/cascaded chain.s2p");

async function importFromEmptyPane(page: Page, filePath: string) {
  await page.goto("/app.html");
  await page.getByTestId("empty-chart-file-input").setInputFiles(filePath);
}

async function isVisible(locator: Locator) {
  return locator.isVisible().catch(() => false);
}

function rightPanelAnchor(page: Page, section: "Analysis" | "Trace Ops" | "Import/Export") {
  if (section === "Analysis") return page.getByTestId("analysis-card-analysis-menu");
  if (section === "Trace Ops") return page.getByTestId("analysis-card-trace-ops");
  return page.getByRole("button", { name: "Export Visible CSV" });
}

async function openRightPanelSection(page: Page, section: "Analysis" | "Trace Ops" | "Import/Export") {
  const rightButton = page.getByRole("button", { name: "Right" });
  if (await isVisible(rightButton)) {
    await rightButton.click();
  }

  const anchor = rightPanelAnchor(page, section);
  if (await isVisible(anchor)) {
    return;
  }

  const sectionButton = page.getByRole("button", { name: section });
  await expect(sectionButton).toBeVisible();
  await sectionButton.click();
  await expect(anchor).toBeVisible();
}

function firstTraceRow(page: Page): Locator {
  return page.locator('[data-testid^="trace-row-"]').first();
}

const timeCsv = "Time (s),CH1 (V)\n0,1\n0.5,2\n1,3\n";
const frequencyCsv = "Frequency (Hz),Magnitude (dBm)\n100,1\n200,2\n300,3\n";

async function dropCsv(page: Page, paneId: string, name: string, text: string) {
  await page.getByTestId(`chart-pane-${paneId}`).evaluate((target, file) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([file.text], file.name, { type: "text/csv" }));
    for (const type of ["dragenter", "dragover", "drop"]) {
      target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }));
    }
  }, { name, text });
}

test("rejecting a trace drop onto another domain shows a warning", async ({ page }) => {
  await page.goto("/app.html");
  await page.getByTestId("empty-chart-file-input").setInputFiles({ name: "time.csv", mimeType: "text/csv", buffer: Buffer.from(timeCsv) });
  const timeRow = page.locator('[data-testid^="trace-row-"]').filter({ hasText: "time.csv" }).first();
  await expect(timeRow).toContainText("P1");
  await page.keyboard.press("2");
  await dropCsv(page, "pane-2", "frequency.csv", frequencyCsv);
  await expect(page.getByTestId("chart-plot-pane-2")).toBeVisible();

  await timeRow.dragTo(page.getByTestId("chart-pane-pane-2"));
  await expect(page.getByRole("alert")).toContainText("frequency-domain");
  await expect(timeRow).toContainText("P1");
});

test("a file dropped onto an incompatible pane is refused", async ({ page }) => {
  await importFromEmptyPane(page, datFixture);
  await expect(firstTraceRow(page)).toContainText("P1");
  await page.keyboard.press("2");
  await dropCsv(page, "pane-2", "frequency.csv", frequencyCsv);
  await expect(page.getByTestId("chart-plot-pane-2")).toBeVisible();

  await dropCsv(page, "pane-2", "time.csv", timeCsv);
  await expect(page.getByRole("alert")).toContainText("Cannot assign a time-domain trace to a pane containing frequency-domain traces");
  await expect(page.locator('[data-testid^="trace-row-"]').filter({ hasText: "time.csv" })).toHaveCount(0);
});

test("multi-pane assignment survives workspace save and reload", async ({ page }) => {
  await importFromEmptyPane(page, datFixture);
  await expect(page.locator(".lp-file--header .lp-name").filter({ hasText: "cascade_ip3_-12dBm.DAT" })).toBeVisible();

  await page.getByRole("button", { name: "+ Pane" }).click();
  await expect(page.getByTestId("chart-pane-pane-2")).toBeVisible();
  await expect(page.getByTestId("empty-trace-pane-dropzone")).toContainText("Drop traces here");

  await firstTraceRow(page).click();
  await page.getByTestId("chart-pane-header-pane-2").getByRole("button", { name: "Move Here" }).click();
  await expect(firstTraceRow(page)).toContainText("P2");

  const workspaceDownloadPromise = page.waitForEvent("download");
  await page.getByTitle("Save Workspace JSON").click();
  const workspaceDownload = await workspaceDownloadPromise;
  const workspacePath = await workspaceDownload.path();
  expect(workspacePath).toBeTruthy();

  await page.getByRole("button", { name: "Clear All" }).click();
  await expect(page.getByTestId("chart-pane-pane-1").getByTestId("empty-chart-dropzone")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("topbar-workspace-input").setInputFiles(workspacePath!);
  await expect(page.getByTestId("chart-pane-pane-2")).toBeVisible();
  await expect(firstTraceRow(page)).toContainText("P2");
});

test("trace ops can create an offset trace and include it in CSV export", async ({ page }) => {
  await importFromEmptyPane(page, datFixture);
  await expect(page.locator(".lp-file--header .lp-name").filter({ hasText: "cascade_ip3_-12dBm.DAT" })).toBeVisible();

  await openRightPanelSection(page, "Trace Ops");
  await page.getByRole("button", { name: "Offset" }).click();
  await page.getByLabel("Source trace").selectOption({ index: 1 });
  await page.getByRole("spinbutton", { name: "dB" }).fill("3");
  await page.getByRole("button", { name: "Create Offset Trace" }).click();

  await expect(page.locator('[data-testid^="trace-row-"]').filter({ hasText: "Offset" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Import/Export" }).click();
  const csvDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Visible CSV" }).click();
  const csvDownload = await csvDownloadPromise;
  const csvPath = await csvDownload.path();
  expect(csvPath).toBeTruthy();

  const csv = readFileSync(csvPath!, "utf8");
  expect(csv).toContain("Frequency");
  expect(csv.toLowerCase()).toContain("offset");
});

test("analysis panels compute visible results for imported spectrum data", async ({ page }) => {
  await importFromEmptyPane(page, datFixture);
  await expect(page.locator(".lp-file--header .lp-name").filter({ hasText: "cascade_ip3_-12dBm.DAT" })).toBeVisible();

  await openRightPanelSection(page, "Analysis");

  await page.getByRole("button", { name: "Range Statistics" }).click();
  await page.getByRole("button", { name: "Compute Stats" }).click();
  await expect(page.getByText("Maximum")).toBeVisible();
  await expect(page.getByText("Average Amplitude")).toBeVisible();

  await page.getByRole("button", { name: "Peak Table" }).click();
  await page.getByRole("button", { name: "Find Peaks" }).click();
  await expect(page.getByRole("columnheader", { name: "Rank" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "#1", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Ripple / Flatness" }).click();
  await page.getByRole("button", { name: "Compute Ripple" }).click();
  await expect(page.getByText("Peak-to-Peak Ripple")).toBeVisible();

  await page.getByRole("button", { name: "Threshold Crossings" }).click();
  await expect(page.getByTestId("analysis-card-threshold-crossings").locator(".ac-result")).toContainText(/\d+\s*crossings?/);
});

test("reference-line placement creates, edits, and deletes sidebar state", async ({ page }) => {
  await importFromEmptyPane(page, datFixture);
  await expect(page.locator(".lp-file--header .lp-name").filter({ hasText: "cascade_ip3_-12dBm.DAT" })).toBeVisible();

  await page.getByRole("button", { name: "V-Line" }).click();
  await page.getByTestId("chart-plot-pane-1").click({ position: { x: 260, y: 120 } });

  const refLine = page.getByTestId("ref-line-row-V1");
  await expect(refLine).toBeVisible();
  await refLine.click();
  await refLine.getByRole("textbox").fill("1.4204GHz");
  await refLine.getByRole("textbox").press("Enter");
  await expect(refLine.getByRole("textbox")).toHaveValue(/1\.420|1420400000/);

  await refLine.getByRole("button", { name: "Delete V1" }).click();
  await expect(page.getByTestId("ref-line-row-V1")).toHaveCount(0);
});

test("Touchstone import exposes matrix controls and analysis cards without crashing", async ({ page }) => {
  await importFromEmptyPane(page, touchstoneFixture);
  await expect(page.locator(".lp-file--header .lp-name").filter({ hasText: "cascaded chain.s2p" })).toBeVisible();

  await expect(page.getByTestId("touchstone-cell-S11")).toBeVisible();
  await page.getByTestId("touchstone-cell-S11").click();
  const s11Trace = page.locator('[data-testid^="trace-row-"]').filter({ hasText: "S11" }).first();
  await expect(s11Trace).toBeVisible();
  await s11Trace.click();

  await openRightPanelSection(page, "Analysis");
  await page.getByRole("button", { name: "VSWR" }).click();
  await expect(page.getByTestId("analysis-card-vswr")).toBeVisible();

  await page.getByRole("button", { name: "Return Loss" }).click();
  await expect(page.getByTestId("analysis-card-return-loss")).toBeVisible();

  await page.getByRole("button", { name: "Touchstone Stability" }).click();
  await expect(page.getByTestId("analysis-card-touchstone-stability")).toBeVisible();
});

test("four empty panes fit without covering each other's headers", async ({ page }) => {
  await importFromEmptyPane(page, datFixture);
  await expect(page.locator(".lp-file--header .lp-name").filter({ hasText: "cascade_ip3_-12dBm.DAT" })).toBeVisible();
  await page.keyboard.press("4");
  await expect(page.getByTestId("chart-pane-pane-4")).toBeVisible();
  await expect(page.getByTestId("empty-trace-pane-dropzone")).toHaveCount(3);

  // Before the fix, each pane's drop box spilled over the next header and intercepted these clicks.
  for (const paneId of ["pane-2", "pane-3", "pane-4"]) {
    const header = page.getByTestId(`chart-pane-header-${paneId}`);
    await header.getByRole("button", { name: "Set Target" }).click({ timeout: 5000 });
    await expect(header).toContainText("Target");
  }
});

test("a multi-channel time CSV fills one new pane instead of one pane per channel", async ({ page }) => {
  await importFromEmptyPane(page, datFixture);
  await expect(page.locator(".lp-file--header .lp-name").filter({ hasText: "cascade_ip3_-12dBm.DAT" })).toBeVisible();

  const rows = ["Time (s),CH1 (V),CH2 (V),CH3 (V),CH4 (V)"];
  for (let i = 0; i < 20; i++) rows.push([i * 1e-6, Math.sin(i), Math.cos(i), i, -i].join(","));
  await openRightPanelSection(page, "Import/Export");
  await page.getByTestId("import-export-data-input").setInputFiles({
    name: "four_channels.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(rows.join("\n")),
  });

  await expect(page.getByTestId("chart-pane-pane-2")).toBeVisible();
  await expect(page.getByTestId("chart-pane-pane-3")).toHaveCount(0);
  const channelRows = page.locator('[data-testid^="trace-row-"]').filter({ hasText: "four_channels" });
  await expect(channelRows).toHaveCount(4);
  for (const row of await channelRows.all()) {
    await expect(row).toContainText("P2");
  }
});

test("Touchstone traces load while the sidebar is hidden", async ({ page }) => {
  await importFromEmptyPane(page, datFixture);
  await expect(page.locator(".lp-file--header .lp-name").filter({ hasText: "cascade_ip3_-12dBm.DAT" })).toBeVisible();
  await page.getByRole("button", { name: "Left" }).click();
  await expect(page.locator(".lp-file--header .lp-name").filter({ hasText: "cascade_ip3_-12dBm.DAT" })).toHaveCount(0);

  await openRightPanelSection(page, "Import/Export");
  await page.getByTestId("import-export-data-input").setInputFiles(touchstoneFixture);

  // 1 spectrum line + the default S11/S21 views; without the fix only the spectrum line is drawn.
  await expect(page.getByTestId("chart-plot-pane-1").locator(".recharts-line")).toHaveCount(3);
});

test("a broken file shows an import error instead of crashing the app", async ({ page }) => {
  await page.goto("/app.html");
  await page.getByTestId("empty-chart-file-input").setInputFiles({
    name: "broken.s2p",
    mimeType: "text/plain",
    buffer: Buffer.from("this is not a network file"),
  });

  await expect(page.getByTestId("import-error")).toContainText("broken.s2p");
  await expect(page.getByTestId("empty-chart-dropzone")).toBeVisible();
  await page.getByTestId("import-error").getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByTestId("import-error")).toHaveCount(0);
});
test("loading a workspace keeps traces in their saved pane even when another pane is the target", async ({ page }) => {
  await importFromEmptyPane(page, datFixture);
  await expect(page.locator(".lp-file--header .lp-name").filter({ hasText: "cascade_ip3_-12dBm.DAT" })).toBeVisible();
  await page.getByRole("button", { name: "+ Pane" }).click();

  await firstTraceRow(page).click();
  await page.getByTestId("chart-pane-header-pane-2").getByRole("button", { name: "Move Here" }).click();
  await expect(firstTraceRow(page)).toContainText("P2");
  await page.getByTestId("chart-pane-header-pane-1").getByRole("button", { name: "Set Target" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTitle("Save Workspace JSON").click();
  const workspacePath = await (await downloadPromise).path();

  await page.getByRole("button", { name: "Clear All" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("topbar-workspace-input").setInputFiles(workspacePath!);
  await expect(firstTraceRow(page)).toContainText("P2");
});
