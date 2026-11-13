import { defineConfig, devices } from "@playwright/test";

// PW_PORT runs the suite on its own dev server, so it never collides with one already on 5173.
const port = Number(process.env.PW_PORT ?? 5173);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
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
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/app.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
