import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@agent-debugger/engine": path.resolve(__dirname, "src/index.ts"),
    },
  },
});
