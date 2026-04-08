import fs from "node:fs/promises";
import path from "node:path";

export default async function globalSetup() {
  const dataDir = path.resolve(process.cwd(), ".playwright/agent-debugger-data");
  await fs.rm(dataDir, { recursive: true, force: true });
  await fs.mkdir(dataDir, { recursive: true });
}
