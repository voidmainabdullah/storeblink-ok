import { defineConfig } from "@playwright/test";

const port = 8091;
const baseURL = `http://127.0.0.1:${port}`;
const chromePath = process.platform === "win32"
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  : undefined;

/**
 * The hard v3 gate must test the current checkout, never a reusable/stale Vite
 * process left on the normal developer port.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results/adaptive-release-playwright",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: chromePath ? { executablePath: chromePath } : undefined,
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
