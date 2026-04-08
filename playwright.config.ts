import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(rootDir, ".playwright/agent-debugger-data");

export default defineConfig({
  testDir: "./apps/web/tests/e2e",
  fullyParallel: false,
  workers: 1,
  globalSetup: "./apps/web/tests/e2e/global-setup.ts",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm --filter @agent-debugger/web exec next dev --hostname 127.0.0.1 --port 3000",
    env: {
      AGENT_DEBUGGER_HOME: dataDir,
    },
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
