import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach } from "vitest";
import { SqliteTraceStore } from "../storage/sqlite-store";
import { TraceImportError } from "../validation/errors";

const testDir = path.dirname(fileURLToPath(import.meta.url));

function loadFixture() {
  const fixturePath = path.resolve(
    testDir,
    "../../../../fixtures/traces/raw/canonical-trace.json",
  );
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

const tempDirs: string[] = [];

function createTempStore() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-debugger-sqlite-"));
  tempDirs.push(dataDir);
  const dbPath = path.join(dataDir, "traces.db");
  return new SqliteTraceStore({ dbPath });
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) =>
      fs.promises.rm(dir, { recursive: true, force: true }),
    ),
  );
});

describe("SqliteTraceStore", () => {
  it("imports, lists, loads, and deletes a raw trace", async () => {
    const store = createTempStore();

    const imported = await store.importTrace(loadFixture(), "canonical-trace.json");
    const list = await store.listTraces();
    const trace = await store.getTrace(imported.traceId);

    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("Canonical raw trace");
    expect(trace.trace.id).toBe(imported.traceId);
    expect(trace.spans.length).toBeGreaterThan(0);
    expect(trace.rawSource).toBeDefined();

    await store.deleteTrace(imported.traceId);
    const listAfterDelete = await store.listTraces();
    expect(listAfterDelete).toHaveLength(0);

    store.close();
  });

  it("handles concurrent imports", async () => {
    const store = createTempStore();

    const [first, second] = await Promise.all([
      store.importTrace(loadFixture(), "trace-a.json"),
      store.importTrace(loadFixture(), "trace-b.json"),
    ]);

    const list = await store.listTraces();

    expect(first.traceId).not.toBe(second.traceId);
    expect(list).toHaveLength(2);

    store.close();
  });

  it("rejects invalid trace ids", async () => {
    const store = createTempStore();

    await expect(store.getTrace("../escape")).rejects.toMatchObject({
      name: "TraceImportError",
      code: "invalid_trace_id",
      status: 400,
    } satisfies Partial<TraceImportError>);

    store.close();
  });

  it("throws when deleting a nonexistent trace", async () => {
    const store = createTempStore();

    await expect(store.deleteTrace("missing-trace")).rejects.toMatchObject({
      name: "TraceImportError",
      code: "trace_not_found",
      status: 404,
    } satisfies Partial<TraceImportError>);

    store.close();
  });

  it("throws when loading a nonexistent trace", async () => {
    const store = createTempStore();

    await expect(store.getTrace("nonexistent")).rejects.toMatchObject({
      name: "TraceImportError",
      code: "trace_not_found",
      status: 404,
    } satisfies Partial<TraceImportError>);

    store.close();
  });

  it("filters traces by framework, status, and search", async () => {
    const store = createTempStore();

    await store.importTrace(loadFixture(), "trace.json");
    const list = await store.listTraces();
    expect(list).toHaveLength(1);

    const byFramework = await store.listTraces({ framework: "raw" });
    expect(byFramework).toHaveLength(1);

    const wrongFramework = await store.listTraces({ framework: "agents-sdk" });
    expect(wrongFramework).toHaveLength(0);

    const byStatus = await store.listTraces({ status: "ok" });
    expect(byStatus).toHaveLength(1);

    const wrongStatus = await store.listTraces({ status: "error" });
    expect(wrongStatus).toHaveLength(0);

    const bySearch = await store.listTraces({ search: "Canonical" });
    expect(bySearch).toHaveLength(1);

    const wrongSearch = await store.listTraces({ search: "nonexistent" });
    expect(wrongSearch).toHaveLength(0);

    store.close();
  });

  it("upserts spans into a new trace", async () => {
    const store = createTempStore();

    const result = await store.upsertSpans("test-trace", [
      {
        id: "span-1",
        traceId: "test-trace",
        kind: "agent",
        name: "Test Agent",
        status: "running",
        provenance: "live",
        startedAt: Date.now(),
        payload: { kind: "agent", agentName: "Test" },
      },
    ], { traceName: "Test Trace" });

    expect(result.spansAdded).toBe(1);
    expect(result.spansUpdated).toBe(0);

    const trace = await store.getTrace("test-trace");
    expect(trace.spans).toHaveLength(1);
    expect(trace.trace.name).toBe("Test Trace");

    // Update existing span
    const result2 = await store.upsertSpans("test-trace", [
      {
        id: "span-1",
        traceId: "test-trace",
        kind: "agent",
        name: "Test Agent",
        status: "ok",
        provenance: "live",
        startedAt: Date.now(),
        endedAt: Date.now() + 1000,
        payload: { kind: "agent", agentName: "Test" },
      },
    ]);

    expect(result2.spansAdded).toBe(0);
    expect(result2.spansUpdated).toBe(1);

    store.close();
  });

  it("rebuildIndex is a no-op", async () => {
    const store = createTempStore();
    await store.importTrace(loadFixture(), "trace.json");
    await store.rebuildIndex();
    const list = await store.listTraces();
    expect(list).toHaveLength(1);
    store.close();
  });
});
