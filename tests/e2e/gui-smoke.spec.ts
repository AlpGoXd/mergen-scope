import { expect, test } from "@playwright/test";
import { readFileSync } from "fs";
import { resolve } from "path";

const datFixture = resolve(process.cwd(), "test files/cascade_ip3_-12dBm.DAT");

test("loads the app shell directly from /app.html", async ({ page }) => {
  await page.goto("/app.html");

  await expect(page.getByTestId("app-root")).toBeVisible();
  await expect(page.getByTestId("empty-chart-dropzone")).toContainText("What should this pane show?");
});

test("imports data, uses marker/search tools, exports CSV, and reloads a workspace", async ({ page }) => {
  await page.goto("/app.html");

  await page.getByTestId("app-open-input").setInputFiles(datFixture);
  await expect(page.locator(".lp-file--header .lp-name").filter({ hasText: "cascade_ip3_-12dBm.DAT" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Peak", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Peak", exact: true }).click();
  await expect(page.getByText("M1", { exact: true })).toBeVisible();

  // Until the Export dialog the top bar's Export is a menu; "Export data (CSV)…" downloads the visible traces.
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeEnabled();

  const csvDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("menu", { name: "Export" }).getByRole("menuitem").filter({ hasText: "Export data (CSV)" }).click();
  const csvDownload = await csvDownloadPromise;
  const csvPath = await csvDownload.path();
  expect(csvPath).toBeTruthy();
  expect(readFileSync(csvPath!, "utf8")).toContain("Frequency");

  const workspaceDownloadPromise = page.waitForEvent("download");
  await page.getByTitle("Save Workspace JSON").click();
  const workspaceDownload = await workspaceDownloadPromise;
  const workspacePath = await workspaceDownload.path();
  expect(workspacePath).toBeTruthy();

  await page.getByRole("button", { name: "Clear All" }).click();
  await expect(page.getByTestId("empty-chart-dropzone")).toBeVisible();

  await page.getByTestId("topbar-workspace-input").setInputFiles(workspacePath!);
  await expect(page.locator(".lp-file--header .lp-name").filter({ hasText: "cascade_ip3_-12dBm.DAT" })).toBeVisible();
});

test("routes ambiguous CSV imports through the import wizard", async ({ page }) => {
  await page.goto("/app.html");

  await page.getByTestId("app-open-input").setInputFiles({
    name: "ambiguous.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("1,2\n2,3\n"),
  });

  await expect(page.getByRole("dialog", { name: "Open ambiguous.csv" })).toBeVisible();
  await page.getByRole("button", { name: "Add 1 trace" }).click();
  await expect(page.locator(".lp-file--header .lp-name").filter({ hasText: "ambiguous.csv" })).toBeVisible();
});

test("import wizard walks several files and can reuse the settings", async ({ page }) => {
  await page.goto("/app.html");
  const csv = "exported by scope\nidx,a,b,c\n1,2,3,4\n2,3,4,5\n3,4,5,6\n";
  await page.getByTestId("app-open-input").setInputFiles([
    { name: "first.csv", mimeType: "text/csv", buffer: Buffer.from(csv) },
    { name: "second.csv", mimeType: "text/csv", buffer: Buffer.from(csv) },
    { name: "third.csv", mimeType: "text/csv", buffer: Buffer.from(csv) },
  ]);

  const wizard = page.getByTestId("import-wizard");
  await expect(page.getByRole("dialog", { name: "Open first.csv" })).toBeVisible();
  await expect(page.getByTestId("import-wizard-queue")).toHaveText("File 1 of 3");
  await expect(page.getByTestId("import-wizard-caption")).toHaveText("first 3 of 3 rows · rows 1–2 skipped");
  await expect(page.getByTestId("wizard-col-1")).toContainText("a");
  await expect(page.getByTestId("wizard-chip-0")).toHaveAttribute("data-role", "x");

  // Skip rows decides where the column names come from.
  const skipRows = wizard.getByLabel("Skip rows");
  await skipRows.press("ArrowDown");
  await expect(page.getByTestId("wizard-col-1")).toContainText("Column 2");
  await skipRows.press("ArrowUp");
  await expect(page.getByTestId("wizard-col-1")).toContainText("a");

  await wizard.getByRole("button", { name: "Skip file" }).click();
  await expect(page.getByRole("dialog", { name: "Open second.csv" })).toBeVisible();
  await expect(page.getByTestId("import-wizard-queue")).toHaveText("File 2 of 3");
  await wizard.getByLabel("Use these settings for the other file").check();
  await wizard.getByRole("button", { name: "Add 3 traces" }).click();
  await expect(wizard).toHaveCount(0);
  await expect(page.locator(".lp-file--header .lp-name").filter({ hasText: "second.csv" })).toBeVisible();
  await expect(page.locator(".lp-file--header .lp-name").filter({ hasText: "third.csv" })).toBeVisible();
  await expect(page.locator(".lp-file--header .lp-name").filter({ hasText: "first.csv" })).toHaveCount(0);
});
