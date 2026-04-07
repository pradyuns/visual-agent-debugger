import { ulid } from "ulid";
import type {
  SpanRecord,
  TraceRecord,
  TokenUsage,
} from "../types/index.js";

export function deriveLatencies(spans: SpanRecord[]): SpanRecord[] {
  return spans.map((span) => {
    if (span.latencyMs !== undefined) return span;
    if (span.startedAt !== undefined && span.endedAt !== undefined) {
      return { ...span, latencyMs: span.endedAt - span.startedAt };
    }
    return span;
  });
}

export function deriveTotals(
  trace: TraceRecord,
  spans: SpanRecord[]
): TraceRecord {
  if (trace.totalTokens !== undefined) return trace;

  let totalInput = 0;
  let totalOutput = 0;
  let hasUsage = false;

  for (const span of spans) {
    if (span.payload.kind === "llm" && span.payload.usage) {
      const usage = span.payload.usage as TokenUsage;
      totalInput += usage.input;
      totalOutput += usage.output;
      hasUsage = true;
    }
  }

  if (!hasUsage) return trace;
  return {
    ...trace,
    totalTokens: { input: totalInput, output: totalOutput },
  };
}

export function createSyntheticRoot(
  traceId: string,
  startedAt: number
): SpanRecord {
  return {
    id: ulid(),
    traceId,
    kind: "root",
    name: "root",
    status: "ok",
    provenance: "simulated",
    startedAt,
    payload: { kind: "root", summary: "Synthetic root span" },
  };
}

export function ensureSingleRoot(
  traceId: string,
  spans: SpanRecord[]
): { spans: SpanRecord[]; rootSpanId: string } {
  const spanIds = new Set(spans.map((s) => s.id));
  const roots = spans.filter(
    (s) => !s.parentSpanId || !spanIds.has(s.parentSpanId)
  );

  if (roots.length === 1 && roots[0] !== undefined) {
    return { spans, rootSpanId: roots[0].id };
  }

  // Multiple roots or no roots: create a synthetic one
  const minStart =
    spans.length > 0
      ? Math.min(...spans.map((s) => s.startedAt))
      : Date.now();
  const syntheticRoot = createSyntheticRoot(traceId, minStart);

  const updatedSpans = spans.map((span) => {
    if (roots.some((r) => r.id === span.id)) {
      return { ...span, parentSpanId: syntheticRoot.id };
    }
    return span;
  });

  return {
    spans: [syntheticRoot, ...updatedSpans],
    rootSpanId: syntheticRoot.id,
  };
}
