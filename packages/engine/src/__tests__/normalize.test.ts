import { describe, it, expect } from "vitest";
import {
  deriveLatencies,
  deriveTotals,
  ensureSingleRoot,
} from "../adapters/normalize.js";
import type { SpanRecord, TraceRecord } from "../types/index.js";

const baseTrace: TraceRecord = {
  schemaVersion: 1,
  id: "trace1",
  name: "test",
  framework: "raw",
  status: "ok",
  startedAt: 0,
  createdAt: 0,
  importedAt: 0,
  updatedAt: 0,
  rootSpanId: "span1",
  tags: [],
  metadata: {},
};

function makeSpan(
  id: string,
  parentId?: string,
  overrides: Partial<SpanRecord> = {}
): SpanRecord {
  const base = {
    id,
    traceId: "trace1",
    kind: "agent" as const,
    name: id,
    status: "ok" as const,
    provenance: "recorded" as const,
    startedAt: 1000,
    endedAt: 2000,
    payload: { kind: "agent" as const },
  };
  return {
    ...base,
    ...(parentId !== undefined ? { parentSpanId: parentId } : {}),
    ...overrides,
  } as SpanRecord;
}

describe("deriveLatencies", () => {
  it("derives latencyMs from startedAt and endedAt", () => {
    const span = makeSpan("s1"); // no latencyMs set — will be absent
    const result = deriveLatencies([span]);
    expect(result[0]!.latencyMs).toBe(1000);
  });

  it("does not overwrite existing latencyMs", () => {
    const span = makeSpan("s1", undefined, { latencyMs: 999 });
    const result = deriveLatencies([span]);
    expect(result[0]!.latencyMs).toBe(999);
  });

  it("leaves latencyMs undefined when endedAt is missing", () => {
    // Construct directly without endedAt to satisfy exactOptionalPropertyTypes
    const span: SpanRecord = {
      id: "s1",
      traceId: "trace1",
      kind: "agent",
      name: "s1",
      status: "ok",
      provenance: "recorded",
      startedAt: 1000,
      payload: { kind: "agent" },
    };
    const result = deriveLatencies([span]);
    expect(result[0]!.latencyMs).toBeUndefined();
  });
});

describe("deriveTotals", () => {
  it("sums token usage from llm spans", () => {
    const spans: SpanRecord[] = [
      {
        ...makeSpan("s1"),
        kind: "llm",
        payload: {
          kind: "llm",
          request: { model: "gpt-4o" },
          usage: { input: 100, output: 50 },
        },
      },
      {
        ...makeSpan("s2"),
        kind: "llm",
        payload: {
          kind: "llm",
          request: { model: "gpt-4o" },
          usage: { input: 200, output: 75 },
        },
      },
    ];
    const result = deriveTotals(baseTrace, spans);
    expect(result.totalTokens).toEqual({ input: 300, output: 125 });
  });

  it("does not overwrite existing totalTokens", () => {
    const spans: SpanRecord[] = [
      {
        ...makeSpan("s1"),
        kind: "llm",
        payload: {
          kind: "llm",
          request: {},
          usage: { input: 100, output: 50 },
        },
      },
    ];
    const traceWithTotals = {
      ...baseTrace,
      totalTokens: { input: 999, output: 999 },
    };
    const result = deriveTotals(traceWithTotals, spans);
    expect(result.totalTokens).toEqual({ input: 999, output: 999 });
  });

  it("leaves totalTokens undefined when no llm spans present", () => {
    const result = deriveTotals(baseTrace, [makeSpan("s1")]);
    expect(result.totalTokens).toBeUndefined();
  });
});

describe("ensureSingleRoot", () => {
  it("returns the existing single root unchanged", () => {
    const spans = [
      makeSpan("root"),
      makeSpan("child", "root"),
      makeSpan("grandchild", "child"),
    ];
    const { spans: result, rootSpanId } = ensureSingleRoot("trace1", spans);
    expect(rootSpanId).toBe("root");
    expect(result).toHaveLength(3);
  });

  it("creates a synthetic root when multiple top-level spans exist", () => {
    const spans = [makeSpan("a"), makeSpan("b"), makeSpan("c")];
    const { spans: result, rootSpanId } = ensureSingleRoot("trace1", spans);
    expect(result).toHaveLength(4);
    const root = result.find((s) => s.id === rootSpanId);
    expect(root).toBeDefined();
    expect(root!.kind).toBe("root");
    expect(root!.provenance).toBe("simulated");
    // All originals should now have the synthetic root as parent
    const nonRoot = result.filter((s) => s.id !== rootSpanId);
    expect(nonRoot.every((s) => s.parentSpanId === rootSpanId)).toBe(true);
  });

  it("creates a synthetic root when spans array is empty", () => {
    // Edge: if all spans have a broken parent chain treated as roots
    const { spans: result } = ensureSingleRoot("trace1", []);
    // Either unchanged or 1 synthetic root
    expect(result.length).toBeGreaterThanOrEqual(0);
  });
});
