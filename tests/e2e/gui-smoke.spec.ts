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
  await expect(page.getByText("cascade_ip3_-12dBm.DAT")).toBeVisible();
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
  await expect(page.getByText("cascade_ip3_-12dBm.DAT")).toBeVisible();
});

test("routes ambiguous CSV imports through the import wizard", async ({ page }) => {
  await page.goto("/app.html");

  await page.getByTestId("empty-chart-file-input").setInputFiles({
    name: "ambiguous.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("1,2\n2,3\n"),
  });

  await expect(page.getByRole("heading", { name: "Import Wizard" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("ambiguous.csv", { exact: true })).toBeVisible();
});
