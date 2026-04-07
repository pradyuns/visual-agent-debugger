export * from "./schemas.js";

import { z } from "zod";
import type { TraceBundle, SpanRecord } from "../types/index.js";
import { TraceBundleSchema } from "./schemas.js";

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: z.ZodIssue[]
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export function validateBundle(input: unknown): TraceBundle {
  const result = TraceBundleSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      "Bundle validation failed",
      result.error.issues
    );
  }
  return result.data as TraceBundle;
}

export function detectCycles(spans: SpanRecord[]): void {
  const spanMap = new Map(spans.map((s) => [s.id, s]));
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function visit(spanId: string): void {
    if (inStack.has(spanId)) {
      throw new Error(
        `Cycle detected in span tree involving span ${spanId}`
      );
    }
    if (visited.has(spanId)) return;
    visited.add(spanId);
    inStack.add(spanId);
    const span = spanMap.get(spanId);
    if (span?.parentSpanId) {
      visit(span.parentSpanId);
    }
    inStack.delete(spanId);
  }

  for (const span of spans) {
    visit(span.id);
  }
}

export function validateEdgeRefs(
  spans: SpanRecord[],
  edges: { id?: string; traceId?: string; fromSpanId: string; toSpanId: string; kind?: string }[]
): void {
  const spanIds = new Set(spans.map((s) => s.id));
  for (const edge of edges) {
    if (!spanIds.has(edge.fromSpanId)) {
      throw new Error(
        `Edge references missing span fromSpanId=${edge.fromSpanId}`
      );
    }
    if (!spanIds.has(edge.toSpanId)) {
      throw new Error(
        `Edge references missing span toSpanId=${edge.toSpanId}`
      );
    }
  }
}
