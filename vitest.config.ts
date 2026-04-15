import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["./packages/engine/vitest.config.ts", "./apps/web/vitest.config.ts"],
  },
});
