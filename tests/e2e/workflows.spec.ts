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

test("multi-pane assignment survives workspace save and reload", async ({ page }) => {
  await importFromEmptyPane(page, datFixture);
  await expect(page.getByText("cascade_ip3_-12dBm.DAT")).toBeVisible();

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

  await page.getByTestId("topbar-workspace-input").setInputFiles(workspacePath!);
  await expect(page.getByTestId("chart-pane-pane-2")).toBeVisible();
  await expect(firstTraceRow(page)).toContainText("P2");
});

test("trace ops can create an offset trace and include it in CSV export", async ({ page }) => {
  await importFromEmptyPane(page, datFixture);
  await expect(page.getByText("cascade_ip3_-12dBm.DAT")).toBeVisible();

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
  await expect(page.getByText("cascade_ip3_-12dBm.DAT")).toBeVisible();

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
  await expect(page.getByText(/Found \d+ crossing/)).toBeVisible();
});

test("reference-line placement creates, edits, and deletes sidebar state", async ({ page }) => {
  await importFromEmptyPane(page, datFixture);
  await expect(page.getByText("cascade_ip3_-12dBm.DAT")).toBeVisible();

  await page.getByRole("button", { name: "V-Line" }).click();
  await page.getByTestId("chart-plot-pane-1").click({ position: { x: 260, y: 120 } });

  const refLine = page.getByTestId("ref-line-row-V1");
  await expect(refLine).toBeVisible();
  await refLine.click();
  await refLine.getByRole("textbox").fill("1.4204GHz");
  await refLine.getByRole("textbox").press("Enter");
  await expect(refLine.getByRole("textbox")).toHaveValue(/1\.420|1420400000/);

  await refLine.getByRole("button", { name: "x" }).click();
  await expect(page.getByTestId("ref-line-row-V1")).toHaveCount(0);
});

test("Touchstone import exposes matrix controls and analysis cards without crashing", async ({ page }) => {
  await importFromEmptyPane(page, touchstoneFixture);
  await expect(page.getByText("cascaded chain.s2p")).toBeVisible();

  await page.getByRole("button", { name: "Matrix" }).click();
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
