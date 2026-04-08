import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/web/tests/e2e",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "pnpm --filter @agent-debugger/web dev -- --hostname 127.0.0.1 --port 3000",
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
