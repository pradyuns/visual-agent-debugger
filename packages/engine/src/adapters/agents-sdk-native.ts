import { z } from "zod";
import type { SpanPayload, SpanRecord, TraceAdapter, TraceBundle } from "../types";
import { TraceImportError } from "../validation/errors";
import { MAX_TRACE_SPANS } from "../validation/normalize";

// Shape emitted by the Python SDK's TraceImpl/SpanImpl.export and backend exporter.
// A backend batch may be partial; import requires a collected, complete single trace.
const traceSchema = z.object({
  object: z.literal("trace"), id: z.string().min(1), workflow_name: z.string().min(1),
  group_id: z.string().nullable().optional(), metadata: z.record(z.unknown()).nullable().optional(),
}).passthrough();
const spanSchema = z.object({
  object: z.literal("trace.span"), id: z.string().min(1), trace_id: z.string().min(1),
  parent_id: z.string().min(1).nullable(), started_at: z.string(), ended_at: z.string(),
  span_data: z.object({ type: z.string().min(1) }).passthrough(),
  error: z.object({ message: z.string().min(1) }).passthrough().nullable(),
}).passthrough();
const batchSchema = z.object({ data: z.array(z.unknown()) });
type NativeData = z.infer<typeof spanSchema>["span_data"];

function invalid(message: string): never {
  throw new TraceImportError("invalid_agents_export", message);
}
function timestamp(value: string): number {
  // Require a timezone so dates do not depend on the importer's machine.
  const match = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d+)?(Z|[+-](\d\d):(\d\d))$/.exec(value);
  if (!match) return invalid("SDK span timestamps must be ISO 8601 values with a timezone.");
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]! ||
      Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59 ||
      Number(offsetHourText ?? 0) > 23 || Number(offsetMinuteText ?? 0) > 59) {
    return invalid("SDK span has an invalid calendar timestamp.");
  }
  const result = Date.parse(value);
  if (!Number.isFinite(result)) return invalid("SDK span has an invalid timestamp.");
  return result;
}
function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}
function payload(data: NativeData): SpanPayload {
  switch (data.type) {
    case "agent": return { kind: "agent", agentName: stringValue(data.name, "Agent") };
    case "function": return { kind: "tool", tool: { name: stringValue(data.name, "Function") }, input: data.input, output: data.output };
    case "generation": {
      const messages = Array.isArray(data.input) ? data.input.flatMap((item: unknown) => {
        if (!item || typeof item !== "object" || !("role" in item) || typeof item.role !== "string" || !("content" in item)) return [];
        return [{ role: item.role, content: typeof item.content === "string" ? item.content : JSON.stringify(item.content) ?? "" }];
      }) : [];
      const usage = data.usage && typeof data.usage === "object" ? data.usage as Record<string, unknown> : undefined;
      const input = usage?.input_tokens, output = usage?.output_tokens;
      return {
        kind: "llm", request: { provider: "openai", model: stringValue(data.model, "unknown"), messages },
        response: data.output == null ? undefined : { output: data.output },
        usage: typeof input === "number" && Number.isInteger(input) && input >= 0 && typeof output === "number" && Number.isInteger(output) && output >= 0 ? { input, output } : undefined,
      };
    }
    case "handoff": return { kind: "handoff", fromAgent: stringValue(data.from_agent, "unknown"), toAgent: stringValue(data.to_agent, "unknown") };
    case "guardrail": return { kind: "guardrail", ruleName: stringValue(data.name, "Guardrail"), outcome: data.triggered === true ? "triggered" : data.triggered === false ? "passed" : undefined, details: data };
    default: return { kind: "custom", label: stringValue(data.name, data.type), input: data };
  }
}

export class NativeAgentsSdkTraceAdapter implements TraceAdapter {
  readonly framework = "agents-sdk" as const;
  canParse(input: unknown): boolean {
    const batch = batchSchema.safeParse(input);
    return batch.success && batch.data.data.some((item) => !!item && typeof item === "object" && "object" in item && (item.object === "trace" || item.object === "trace.span"));
  }
  normalize(input: unknown): TraceBundle {
    const batch = batchSchema.safeParse(input);
    if (!batch.success) return invalid("Expected an SDK export containing a data array.");
    const traces: z.infer<typeof traceSchema>[] = [];
    const nativeSpans: z.infer<typeof spanSchema>[] = [];
    for (const item of batch.data.data) {
      const trace = traceSchema.safeParse(item);
      if (trace.success) { traces.push(trace.data); continue; }
      const span = spanSchema.safeParse(item);
      if (span.success) { nativeSpans.push(span.data); continue; }
      return invalid("SDK export contains an invalid, incomplete, or unsupported record. Collect completed trace and span exports before importing.");
    }
    if (traces.length !== 1) return invalid("SDK export must contain exactly one trace record; collect a complete single trace before importing.");
    const trace = traces[0]!;
    if (!nativeSpans.length) return invalid("SDK export must contain at least one completed span.");
    if (nativeSpans.length > MAX_TRACE_SPANS) return invalid(`Trace exceeds the limit of ${MAX_TRACE_SPANS} spans.`);
    if (nativeSpans.some((span) => span.trace_id !== trace.id)) return invalid("SDK export contains spans from another trace.");
    const ids = new Set(nativeSpans.map((span) => span.id));
    if (ids.size !== nativeSpans.length) return invalid("SDK export contains duplicate span IDs.");
    if (nativeSpans.some((span) => span.parent_id && !ids.has(span.parent_id))) return invalid("SDK export has a missing parent span; collect the complete trace before importing.");
    const spans: SpanRecord[] = nativeSpans.map((span) => {
      const startedAt = timestamp(span.started_at), endedAt = timestamp(span.ended_at);
      if (endedAt < startedAt) return invalid("SDK span ends before it starts.");
      const mapped = payload(span.span_data);
      return { id: span.id, traceId: trace.id, parentSpanId: span.parent_id ?? undefined,
        kind: mapped.kind, name: stringValue(span.span_data.name, span.span_data.type),
        status: span.error ? "error" : "ok", provenance: "recorded", startedAt, endedAt,
        latencyMs: endedAt - startedAt, error: span.error ? { message: span.error.message } : undefined,
        payload: mapped, raw: span };
    });
    const createdAt = Date.now();
    return { trace: { schemaVersion: 1, id: trace.id, name: trace.workflow_name, framework: "agents-sdk",
      status: spans.some((span) => span.status === "error") ? "error" : "ok",
      startedAt: Math.min(...spans.map((span) => span.startedAt)), endedAt: Math.max(...spans.map((span) => span.endedAt!)),
      createdAt, importedAt: createdAt, updatedAt: createdAt, rootSpanId: spans.find((span) => !span.parentSpanId)?.id ?? spans[0]!.id,
      tags: [], metadata: { ...(trace.metadata ?? {}), ...(trace.group_id ? { group_id: trace.group_id } : {}) } },
      spans, edges: [], rawSource: input };
  }
}
