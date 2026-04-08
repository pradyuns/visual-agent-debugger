import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@agent-debugger/engine": path.resolve(
        __dirname,
        "packages/engine/src/index.ts",
      ),
    },
  },
  test: {
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    environmentMatchGlobs: [
      ["packages/engine/**", "node"],
      ["apps/web/**", "jsdom"],
    ],
    include: [
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx",
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
    ],
  },
});
