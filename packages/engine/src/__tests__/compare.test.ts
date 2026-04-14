import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareTraces } from "../queries/compare";
import { normalizeTraceBundle } from "../validation/normalize";
import { RawTraceAdapter } from "../adapters/raw";
import type { SpanRecord, TraceBundle } from "../types";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const adapter = new RawTraceAdapter();

function loadCanonical(): TraceBundle {
  const fixturePath = path.resolve(
    testDir,
    "../../../../fixtures/traces/raw/canonical-trace.json",
  );
  const input = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  return normalizeTraceBundle(adapter.normalize(input), { rawSource: input });
}

function cloneBundle(bundle: TraceBundle): TraceBundle {
  return JSON.parse(JSON.stringify(bundle));
}

describe("compareTraces", () => {
  it("reports all unchanged for identical traces", () => {
    const bundle = loadCanonical();
    const result = compareTraces(bundle, cloneBundle(bundle));

    expect(result.summary.unchanged).toBe(bundle.spans.length);
    expect(result.summary.added).toBe(0);
    expect(result.summary.removed).toBe(0);
    expect(result.summary.changed).toBe(0);
  });

  it("detects an added span", () => {
    const left = loadCanonical();
    const right = cloneBundle(left);

    const newSpan: SpanRecord = {
      id: "extra-span",
      traceId: right.trace.id,
      parentSpanId: right.trace.rootSpanId,
      kind: "tool",
      name: "Extra Tool",
      status: "ok",
      provenance: "recorded",
      startedAt: right.trace.startedAt + 100,
      endedAt: right.trace.startedAt + 200,
      latencyMs: 100,
      payload: { kind: "tool", tool: { name: "extra" } },
    };
    right.spans.push(newSpan);

    const result = compareTraces(left, right);
    expect(result.summary.added).toBe(1);

    const addedDiff = result.diffs.find((d) => d.status === "added");
    expect(addedDiff).toBeDefined();
    expect(addedDiff?.right?.name).toBe("Extra Tool");
  });

  it("detects a removed span", () => {
    const left = loadCanonical();
    const right = cloneBundle(left);

    // Remove a non-root span
    const nonRoot = right.spans.find((s) => s.id !== right.trace.rootSpanId);
    right.spans = right.spans.filter((s) => s.id !== nonRoot?.id);

    const result = compareTraces(left, right);
    expect(result.summary.removed).toBeGreaterThanOrEqual(1);
  });

  it("detects a changed span status", () => {
    const left = loadCanonical();
    const right = cloneBundle(left);

    // Change the status of a non-root span
    const target = right.spans.find((s) => s.id !== right.trace.rootSpanId);
    if (target) target.status = "error";

    const result = compareTraces(left, right);
    expect(result.summary.changed).toBeGreaterThanOrEqual(1);

    const changedDiff = result.diffs.find((d) => d.status === "changed");
    expect(changedDiff).toBeDefined();
    expect(changedDiff?.changes?.some((c) => c.field === "status")).toBe(true);
  });

  it("computes latency delta for matched spans", () => {
    const left = loadCanonical();
    const right = cloneBundle(left);

    // Adjust latency on a span
    const target = right.spans.find((s) => s.latencyMs != null);
    if (target && target.latencyMs != null) {
      target.latencyMs += 500;
    }

    const result = compareTraces(left, right);
    const matched = result.diffs.find(
      (d) => d.latencyDelta !== undefined && d.latencyDelta !== 0,
    );
    expect(matched?.latencyDelta).toBe(500);
  });

  it("summary counts are accurate", () => {
    const left = loadCanonical();
    const right = cloneBundle(left);

    const result = compareTraces(left, right);
    const total =
      result.summary.added +
      result.summary.removed +
      result.summary.changed +
      result.summary.unchanged;

    expect(total).toBe(result.diffs.length);
  });
});
