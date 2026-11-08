import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ testDir: '.', use: { baseURL: 'http://127.0.0.1:5184', ...devices['Desktop Chrome'] }, webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5184 --strictPort', url: 'http://127.0.0.1:5184/app.html', reuseExistingServer: false }, workers: 1 });

