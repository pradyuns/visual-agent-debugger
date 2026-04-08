import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach } from "vitest";
import { createTraceStore } from "../storage/trace-store";

const testDir = path.dirname(fileURLToPath(import.meta.url));

function loadFixture() {
  const fixturePath = path.resolve(
    testDir,
    "../../../../fixtures/traces/raw/canonical-trace.json",
  );
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) =>
      fs.promises.rm(dir, { recursive: true, force: true }),
    ),
  );
});

describe("LocalTraceStore", () => {
  it("imports, lists, loads, and rebuilds a raw trace", async () => {
    const dataDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "agent-debugger-"),
    );
    tempDirs.push(dataDir);
    const store = createTraceStore({ dataDir });

    const imported = await store.importTrace(loadFixture(), "canonical-trace.json");
    const list = await store.listTraces();
    const trace = await store.getTrace(imported.traceId);

    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("Canonical raw trace");
    expect(trace.trace.id).toBe(imported.traceId);
    expect(trace.rawSource).toMatchObject({
      trace: {
        name: "Canonical raw trace",
      },
    });

    await store.rebuildIndex();
    const rebuiltList = await store.listTraces();

    expect(rebuiltList).toHaveLength(1);
  });
});
