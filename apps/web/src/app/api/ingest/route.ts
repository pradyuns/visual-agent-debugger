import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  edgeRecordSchema,
  spanRecordSchema,
  traceFrameworkSchema,
  type SpanRecord,
} from "../../../lib/engine";
import { getTraceStore } from "../../../lib/store";
import { toErrorResponse } from "../../../lib/errors";
import { authorizeIngestRequest } from "../../../lib/ingest-auth";

const SAFE_TRACE_ID = /^[A-Za-z0-9_-]+$/;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reuse the canonical span/edge schemas so the writer (ingest) is as strict as
// the reader (GET /api/traces/:id). In particular this ensures `payload` goes
// through the discriminated union keyed on `kind`, instead of accepting any
// record and poisoning the store with data that later fails to re-read.
const ingestSpanSchema = spanRecordSchema.omit({ traceId: true });
const ingestEdgeSchema = edgeRecordSchema.omit({ traceId: true });

const ingestSchema = z.object({
  traceId: z.string().optional(),
  traceName: z.string().optional(),
  framework: traceFrameworkSchema.optional(),
  spans: z.array(ingestSpanSchema).min(1),
  edges: z.array(ingestEdgeSchema).optional(),
});

export async function POST(request: Request) {
  try {
    const auth = authorizeIngestRequest(request);
    if (!auth.ok) {
      return Response.json(
        { error: auth.error, message: auth.message },
        { status: auth.status },
      );
    }

    const body = await request.json();
    const parsed = ingestSchema.parse(body);

    const traceId = parsed.traceId ?? `trace_${randomUUID().replace(/-/g, "")}`;
    if (!SAFE_TRACE_ID.test(traceId)) {
      return Response.json(
        { error: "invalid_trace_id", message: "Trace ID contains unsupported characters." },
        { status: 400 },
      );
    }

    const spans: SpanRecord[] = parsed.spans.map((s) => ({ ...s, traceId }));

    const store = getTraceStore();
    const result = await store.upsertSpans(traceId, spans, {
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
