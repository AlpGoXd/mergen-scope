import { expect, test } from "@playwright/test";

test("serves the production app as static Cloudflare Pages-compatible files", async ({ page, request }) => {
  await page.goto("/app.html");

  await expect(page.getByTestId("app-root")).toBeVisible();
  await expect(page.getByTestId("empty-chart-dropzone")).toContainText("What should this pane show?");

  const iconResponse = await request.get("/mergen-scope-icon.svg");
  expect(iconResponse.ok()).toBe(true);
});
