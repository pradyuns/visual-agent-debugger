import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@agent-debugger/engine": path.resolve(
        __dirname,
        "../../packages/engine/src/index.ts",
      ),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [path.resolve(__dirname, "../../vitest.setup.ts")],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
