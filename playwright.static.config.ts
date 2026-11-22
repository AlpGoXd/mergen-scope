import { defineConfig, devices } from "@playwright/test";

// PW_STATIC_PORT runs the built-bundle suite on its own preview server, so parallel folders never share one.
const port = Number(process.env.PW_STATIC_PORT ?? 4173);

export default defineConfig({
  testDir: "tests/static",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-static" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/app.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
