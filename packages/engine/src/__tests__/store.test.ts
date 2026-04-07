import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SqliteTraceStore } from "../storage/store.js";

const fixturesDir = resolve(__dirname, "../../../../fixtures/traces");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
}

let tmpDir: string;
let store: SqliteTraceStore;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "agent-debugger-test-"));
  store = new SqliteTraceStore(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("SqliteTraceStore.importTrace", () => {
  it("imports a raw bundle and returns a traceId", async () => {
    const fixture = loadFixture("simple-raw-bundle.json");
    const { traceId } = await store.importTrace(fixture, "simple-raw-bundle.json");
    expect(traceId).toBe("01HZRAW000000000000000001");
  });

  it("imports an Agents SDK trace and returns a traceId", async () => {
    const fixture = loadFixture("agents-sdk-simple.json");
    const { traceId } = await store.importTrace(fixture, "agents-sdk-simple.json");
    expect(typeof traceId).toBe("string");
    expect(traceId.length).toBeGreaterThan(0);
  });

  it("writes bundle.json to disk", async () => {
    const fixture = loadFixture("simple-raw-bundle.json");
    const { traceId } = await store.importTrace(fixture, "test.json");
    const bundlePath = join(tmpDir, "traces", traceId, "bundle.json");
    const content = JSON.parse(readFileSync(bundlePath, "utf8")) as unknown;
    expect((content as { trace: { id: string } }).trace.id).toBe(traceId);
  });

  it("writes raw/source.json for adapters that include rawSource", async () => {
    const fixture = loadFixture("agents-sdk-simple.json");
    const { traceId } = await store.importTrace(fixture, "test.json");
    const rawPath = join(tmpDir, "traces", traceId, "raw", "source.json");
    const content = readFileSync(rawPath, "utf8");
    expect(content.length).toBeGreaterThan(0);
  });

  it("rejects an unsupported format without writing files", async () => {
    await expect(
      store.importTrace({ unknown: "format" }, "bad.json")
    ).rejects.toThrow();
  });
});

describe("SqliteTraceStore.listTraces", () => {
  it("lists imported traces", async () => {
    const raw = loadFixture("simple-raw-bundle.json");
    await store.importTrace(raw, "raw.json");
    const sdk = loadFixture("agents-sdk-simple.json");
    await store.importTrace(sdk, "sdk.json");

    const traces = await store.listTraces();
    expect(traces.length).toBe(2);
  });

  it("filters by framework", async () => {
    const raw = loadFixture("simple-raw-bundle.json");
    await store.importTrace(raw, "raw.json");
    const sdk = loadFixture("agents-sdk-simple.json");
    await store.importTrace(sdk, "sdk.json");

    const rawOnly = await store.listTraces({ framework: "raw" });
    expect(rawOnly.length).toBe(1);
    expect(rawOnly[0]!.framework).toBe("raw");
  });

  it("filters by status", async () => {
    const raw = loadFixture("simple-raw-bundle.json");
    await store.importTrace(raw, "raw.json");

    const okTraces = await store.listTraces({ status: "ok" });
    expect(okTraces.every((t) => t.status === "ok")).toBe(true);
  });

  it("returns an empty array when no traces match", async () => {
    const traces = await store.listTraces({ status: "error" });
    expect(traces).toHaveLength(0);
  });
});

describe("SqliteTraceStore.getTrace", () => {
  it("retrieves an imported trace bundle", async () => {
    const raw = loadFixture("simple-raw-bundle.json");
    const { traceId } = await store.importTrace(raw, "raw.json");
    const bundle = await store.getTrace(traceId);
    expect(bundle.trace.id).toBe(traceId);
    expect(bundle.spans.length).toBeGreaterThan(0);
  });

  it("includes a childrenByParent map", async () => {
    const raw = loadFixture("simple-raw-bundle.json");
    const { traceId } = await store.importTrace(raw, "raw.json");
    const bundle = await store.getTrace(traceId);
    expect(bundle.childrenByParent).toBeInstanceOf(Map);
  });

  it("throws when traceId does not exist", async () => {
    await expect(store.getTrace("nonexistent-id")).rejects.toThrow();
  });
});

describe("SqliteTraceStore.deleteTrace", () => {
  it("removes trace from listing after deletion", async () => {
    const raw = loadFixture("simple-raw-bundle.json");
    const { traceId } = await store.importTrace(raw, "raw.json");
    await store.deleteTrace(traceId);
    const traces = await store.listTraces();
    expect(traces.find((t) => t.id === traceId)).toBeUndefined();
  });

  it("removes bundle file from disk after deletion", async () => {
    const raw = loadFixture("simple-raw-bundle.json");
    const { traceId } = await store.importTrace(raw, "raw.json");
    await store.deleteTrace(traceId);
    await expect(store.getTrace(traceId)).rejects.toThrow();
  });
});
