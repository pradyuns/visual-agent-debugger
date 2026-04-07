import { describe, it, expect } from "vitest";
import {
  validateBundle,
  detectCycles,
  validateEdgeRefs,
  ValidationError,
} from "../validation/index.js";
import type { TraceBundle, SpanRecord } from "../types/index.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fixturesDir = resolve(__dirname, "../../../../fixtures/traces");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(fixturesDir, name), "utf8"));
}

const validBundle: TraceBundle = JSON.parse(
  readFileSync(resolve(fixturesDir, "simple-raw-bundle.json"), "utf8")
) as TraceBundle;

describe("validateBundle", () => {
  it("accepts a valid canonical bundle", () => {
    const result = validateBundle(validBundle);
    expect(result.trace.id).toBe("01HZRAW000000000000000001");
    expect(result.spans).toHaveLength(4);
  });

  it("rejects a bundle missing schemaVersion", () => {
    const bad = { ...validBundle, trace: { ...validBundle.trace, schemaVersion: 2 } };
    expect(() => validateBundle(bad)).toThrow(ValidationError);
  });

  it("rejects a bundle with missing required span fields", () => {
    const bad = {
      ...validBundle,
      spans: [{ id: "x", traceId: "y" }],
    };
    expect(() => validateBundle(bad)).toThrow(ValidationError);
  });

  it("rejects a non-object input", () => {
    expect(() => validateBundle("not an object")).toThrow(ValidationError);
    expect(() => validateBundle(null)).toThrow(ValidationError);
    expect(() => validateBundle(42)).toThrow(ValidationError);
  });
});

describe("detectCycles", () => {
  it("passes when there are no cycles", () => {
    expect(() => detectCycles(validBundle.spans)).not.toThrow();
  });

  it("detects a direct self-reference cycle", () => {
    const cyclic: SpanRecord[] = [
      {
        id: "a",
        traceId: "t",
        parentSpanId: "a",
        kind: "agent",
        name: "cyclic",
        status: "ok",
        provenance: "recorded",
        startedAt: 0,
        payload: { kind: "agent" },
      },
    ];
    expect(() => detectCycles(cyclic)).toThrow(/cycle/i);
  });

  it("detects a two-node cycle", () => {
    const cyclic: SpanRecord[] = [
      {
        id: "a",
        traceId: "t",
        parentSpanId: "b",
        kind: "agent",
        name: "a",
        status: "ok",
        provenance: "recorded",
        startedAt: 0,
        payload: { kind: "agent" },
      },
      {
        id: "b",
        traceId: "t",
        parentSpanId: "a",
        kind: "agent",
        name: "b",
        status: "ok",
        provenance: "recorded",
        startedAt: 0,
        payload: { kind: "agent" },
      },
    ];
    expect(() => detectCycles(cyclic)).toThrow(/cycle/i);
  });
});

describe("validateEdgeRefs", () => {
  it("passes when all edges reference valid spans", () => {
    expect(() =>
      validateEdgeRefs(validBundle.spans, validBundle.edges)
    ).not.toThrow();
  });

  it("rejects an edge with a missing fromSpanId", () => {
    expect(() =>
      validateEdgeRefs(validBundle.spans, [
        {
          id: "e1",
          traceId: "t",
          fromSpanId: "nonexistent",
          toSpanId: validBundle.spans[0]!.id,
          kind: "dependency",
        },
      ])
    ).toThrow(/fromSpanId/);
  });

  it("rejects an edge with a missing toSpanId", () => {
    expect(() =>
      validateEdgeRefs(validBundle.spans, [
        {
          id: "e1",
          traceId: "t",
          fromSpanId: validBundle.spans[0]!.id,
          toSpanId: "nonexistent",
          kind: "dependency",
        },
      ])
    ).toThrow(/toSpanId/);
  });
});

describe("fixture loading", () => {
  it("loads the simple raw bundle fixture", () => {
    const fixture = loadFixture("simple-raw-bundle.json");
    const bundle = validateBundle(fixture);
    expect(bundle.spans).toHaveLength(4);
    expect(bundle.trace.framework).toBe("raw");
  });
});
