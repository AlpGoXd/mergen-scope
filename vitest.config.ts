import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    // Locally, half the cores, so a full run leaves the machine usable.
    maxWorkers: process.env.CI ? undefined : "50%",
    globals: true,
    setupFiles: ["tests/unit/setup.ts"],
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"],
    css: true,
  },
});
