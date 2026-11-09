import { expect, test } from "@playwright/test";
import { readFileSync } from "fs";
import { resolve } from "path";

const datFixture = resolve(process.cwd(), "test files/cascade_ip3_-12dBm.DAT");

test("loads the app shell directly from /app.html", async ({ page }) => {
  await page.goto("/app.html");

  await expect(page.getByTestId("app-root")).toBeVisible();
  await expect(page.getByTestId("empty-chart-dropzone")).toContainText("Drop files here");
});

test("imports data, uses marker/search tools, exports CSV, and reloads a workspace", async ({ page }) => {
  await page.goto("/app.html");

  await page.getByTestId("empty-chart-file-input").setInputFiles(datFixture);
  await expect(page.locator(".lp-file--header .lp-name").filter({ hasText: "cascade_ip3_-12dBm.DAT" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Peak", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Peak", exact: true }).click();
  await expect(page.getByText("M1", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Right" }).click();
  await page.getByRole("button", { name: "Import/Export" }).click();
  await expect(page.getByRole("button", { name: "Export Visible CSV" })).toBeEnabled();

  const csvDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Visible CSV" }).click();
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

  await page.getByTestId("empty-chart-file-input").setInputFiles({
    name: "ambiguous.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("1,2\n2,3\n"),
  });

  await expect(page.getByRole("dialog", { name: "Import table" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.locator(".lp-file--header .lp-name").filter({ hasText: "ambiguous.csv" })).toBeVisible();
});

test("import wizard shows which rows and columns its settings select", async ({ page }) => {
  await page.goto("/app.html");
  const csv = "exported by scope\nidx,a,b,c\n1,2,3,4\n2,3,4,5\n3,4,5,6\n";
  await page.getByTestId("empty-chart-file-input").setInputFiles([
    { name: "first.csv", mimeType: "text/csv", buffer: Buffer.from(csv) },
    { name: "second.csv", mimeType: "text/csv", buffer: Buffer.from(csv) },
  ]);

  const wizard = page.getByRole("dialog", { name: "Import table" });
  await expect(wizard).toBeVisible();
  await expect(page.getByTestId("import-wizard-queue")).toHaveText("File 1 of 2");

  // Data starts at row 3, so row 2 supplies the column names.
  await wizard.getByLabel("Data starts at row").fill("3");
  await expect(page.getByTestId("wizard-col-1")).toContainText("a");
  await expect(page.getByTestId("wizard-col-0")).toContainText("X");
  await expect(page.getByTestId("import-wizard-summary")).toContainText("3 rows");

  // Choosing a Y column as X removes it from the Y set.
  await expect(page.getByTestId("wizard-col-1")).toContainText("Y");
  await wizard.getByLabel("X column").selectOption({ label: "2: a" });
  await expect(page.getByTestId("wizard-col-1")).toContainText("X");
  await expect(page.getByTestId("wizard-col-1")).not.toContainText("Y");

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("import-wizard-queue")).toHaveCount(0);
  await expect(wizard).toBeVisible();
  await wizard.getByRole("button", { name: "Skip" }).click();
  await expect(wizard).toHaveCount(0);
});