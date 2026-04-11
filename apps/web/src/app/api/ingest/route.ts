import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getTraceStore } from "../../../lib/store";
import { toErrorResponse } from "../../../lib/errors";

const SAFE_TRACE_ID = /^[A-Za-z0-9_-]+$/;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ingestSchema = z.object({
  traceId: z.string().optional(),
  traceName: z.string().optional(),
  framework: z.enum(["agents-sdk", "raw"]).optional(),
  spans: z
    .array(
      z.object({
        id: z.string(),
        traceId: z.string().optional(),
        parentSpanId: z.string().optional(),
        kind: z.enum(["root", "agent", "llm", "tool", "handoff", "retrieval", "guardrail", "custom"]),
        name: z.string(),
        status: z.enum(["ok", "error", "running"]),
        provenance: z.enum(["recorded", "simulated", "live", "edited"]),
        startedAt: z.number(),
        endedAt: z.number().optional(),
        latencyMs: z.number().optional(),
        error: z
          .object({
            message: z.string(),
            type: z.string().optional(),
            stack: z.string().optional(),
            code: z.string().optional(),
            retryable: z.boolean().optional(),
          })
          .optional(),
        stateSnapshot: z.record(z.unknown()).optional(),
        payload: z.record(z.unknown()),
        raw: z.unknown().optional(),
      }),
    )
    .min(1),
  edges: z
    .array(
      z.object({
        id: z.string(),
        traceId: z.string().optional(),
        fromSpanId: z.string(),
        toSpanId: z.string(),
        kind: z.enum(["handoff", "retry", "dependency", "correlation"]),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = ingestSchema.parse(body);

    const traceId = parsed.traceId ?? `trace_${randomUUID().replace(/-/g, "")}`;
    if (!SAFE_TRACE_ID.test(traceId)) {
      return Response.json(
        { error: "invalid_trace_id", message: "Trace ID contains unsupported characters." },
        { status: 400 },
      );
    }

    const spans = parsed.spans.map((s) => ({
      ...s,
      traceId,
    }));

    const store = getTraceStore();
    const result = await store.upsertSpans(traceId, spans as any, {
      traceName: parsed.traceName,
      framework: parsed.framework,
    });

    return Response.json(
      { traceId: result.traceId, spansAdded: result.spansAdded },
      { status: 201 },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
