import { normalizeTraceBundle } from "../validation/normalize";
import { TraceImportError } from "../validation/errors";
import type { TraceBundle } from "../types";

function createBundle(spans: TraceBundle["spans"], edges: TraceBundle["edges"] = []): TraceBundle {
  return {
    trace: {
      schemaVersion: 1,
      id: "trace_input",
      name: "Input trace",
      framework: "raw",
      status: "ok",
      startedAt: 100,
      endedAt: 400,
      createdAt: 100,
      importedAt: 100,
      updatedAt: 100,
      rootSpanId: spans[0]?.id ?? "missing",
      tags: [],
      metadata: {},
    },
    spans,
    edges,
  };
}

describe("normalizeTraceBundle", () => {
  it("creates a synthetic root when a bundle has multiple top-level spans", () => {
    const normalized = normalizeTraceBundle(
      createBundle([
        {
          id: "a",
          traceId: "trace_input",
          kind: "agent",
          name: "Agent A",
          status: "ok",
          provenance: "recorded",
          startedAt: 100,
          endedAt: 200,
          payload: { kind: "agent", agentName: "Agent A" },
        },
        {
          id: "b",
          traceId: "trace_input",
          kind: "agent",
          name: "Agent B",
          status: "ok",
          provenance: "recorded",
          startedAt: 210,
          endedAt: 320,
          payload: { kind: "agent", agentName: "Agent B" },
        },
      ]),
      { traceId: "normalized_trace", importedAt: 999 },
    );

    expect(normalized.trace.rootSpanId).toMatch(/^root_/);
    expect(normalized.spans).toHaveLength(3);
    expect(
      normalized.spans.filter((span) => span.parentSpanId === normalized.trace.rootSpanId),
    ).toHaveLength(2);
  });

  it("derives total token usage from llm spans", () => {
    const normalized = normalizeTraceBundle(
      createBundle([
        {
          id: "root",
          traceId: "trace_input",
          kind: "root",
          name: "Root",
          status: "ok",
          provenance: "recorded",
          startedAt: 100,
          endedAt: 300,
          payload: { kind: "root" },
        },
        {
          id: "llm",
          traceId: "trace_input",
          parentSpanId: "root",
          kind: "llm",
          name: "Draft",
          status: "ok",
          provenance: "recorded",
          startedAt: 120,
          endedAt: 200,
          payload: {
            kind: "llm",
            request: {
              provider: "openai",
              model: "gpt-4.1-mini",
              messages: [],
            },
            usage: { input: 12, output: 4 },
          },
        },
      ]),
      { traceId: "normalized_trace", importedAt: 999 },
    );

    expect(normalized.trace.totalTokens).toEqual({ input: 12, output: 4 });
  });

  it("rejects parent cycles", () => {
    expect(() =>
      normalizeTraceBundle(
        createBundle([
          {
            id: "a",
            traceId: "trace_input",
            parentSpanId: "b",
            kind: "agent",
            name: "A",
            status: "ok",
            provenance: "recorded",
            startedAt: 100,
            endedAt: 200,
            payload: { kind: "agent", agentName: "A" },
          },
          {
            id: "b",
            traceId: "trace_input",
            parentSpanId: "a",
            kind: "agent",
            name: "B",
            status: "ok",
            provenance: "recorded",
            startedAt: 120,
            endedAt: 220,
            payload: { kind: "agent", agentName: "B" },
          },
        ]),
        { traceId: "normalized_trace", importedAt: 999 },
      ),
    ).toThrow(TraceImportError);
  });

  it("rejects secondary edges that reference missing spans", () => {
    expect(() =>
      normalizeTraceBundle(
        createBundle(
          [
            {
              id: "root",
              traceId: "trace_input",
              kind: "root",
              name: "Root",
              status: "ok",
              provenance: "recorded",
              startedAt: 100,
              endedAt: 200,
              payload: { kind: "root" },
            },
          ],
          [
            {
              id: "edge_1",
              traceId: "trace_input",
              fromSpanId: "root",
              toSpanId: "missing",
              kind: "dependency",
            },
          ],
        ),
        { traceId: "normalized_trace", importedAt: 999 },
      ),
    ).toThrow(TraceImportError);
  });
});
