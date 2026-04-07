import { ulid } from "ulid";
import type {
  TraceAdapter,
  TraceBundle,
  SpanRecord,
  EdgeRecord,
  TraceRecord,
  SpanStatus,
  SpanKind,
} from "../types/index.js";
import { deriveLatencies, deriveTotals, ensureSingleRoot } from "./normalize.js";
import { detectCycles, validateEdgeRefs } from "../validation/index.js";

// OpenAI Agents SDK trace format shapes
interface AgentsSdkSpan {
  span_id: string;
  trace_id: string;
  parent_id?: string;
  started_at?: number;
  ended_at?: number;
  error?: {
    message?: string;
    type?: string;
    stack?: string;
    code?: string;
    retryable?: boolean;
  } | null;
  span_data: AgentsSdkSpanData;
}

type AgentsSdkSpanData =
  | { type: "agent"; name?: string; input?: unknown; output?: unknown; handoffs?: string[] }
  | {
      type: "response";
      input?: unknown;
      response?: Record<string, unknown>;
      usage?: { input_tokens?: number; output_tokens?: number };
      model?: string;
    }
  | { type: "function"; name?: string; input?: unknown; output?: unknown }
  | {
      type: "handoff";
      from_agent?: string;
      to_agent?: string;
      reason?: string;
    }
  | { type: "retrieval"; query?: string; results?: unknown[] }
  | {
      type: "guardrail";
      guardrail_name?: string;
      outcome?: string;
      details?: unknown;
    }
  | { type: string; [key: string]: unknown };

interface AgentsSdkTrace {
  trace_id?: string;
  name?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  spans: AgentsSdkSpan[];
}

function isAgentsSdkTrace(input: unknown): input is AgentsSdkTrace {
  if (typeof input !== "object" || input === null) return false;
  const obj = input as Record<string, unknown>;
  return (
    Array.isArray(obj["spans"]) &&
    obj["spans"].length > 0 &&
    typeof (obj["spans"] as unknown[])[0] === "object" &&
    (obj["spans"] as Record<string, unknown>[])[0] !== null &&
    "span_data" in ((obj["spans"] as Record<string, unknown>[])[0] as object)
  );
}

function mapStatus(error: AgentsSdkSpan["error"]): SpanStatus {
  if (error && error !== null) return "error";
  return "ok";
}

function mapKind(data: AgentsSdkSpanData): SpanKind {
  switch (data.type) {
    case "agent": return "agent";
    case "response": return "llm";
    case "function": return "tool";
    case "handoff": return "handoff";
    case "retrieval": return "retrieval";
    case "guardrail": return "guardrail";
    default: return "custom";
  }
}

function mapSpanName(data: AgentsSdkSpanData): string {
  switch (data.type) {
    case "agent":
      return (data as { type: "agent"; name?: string }).name ?? "agent";
    case "response":
      return (data as { type: "response"; model?: string }).model
        ? `llm:${(data as { type: "response"; model?: string }).model}`
        : "llm";
    case "function":
      return (data as { type: "function"; name?: string }).name ?? "tool";
    case "handoff": {
      const h = data as { type: "handoff"; from_agent?: string; to_agent?: string };
      return `handoff:${h.from_agent ?? "?"}→${h.to_agent ?? "?"}`;
    }
    case "retrieval":
      return "retrieval";
    case "guardrail": {
      const g = data as { type: "guardrail"; guardrail_name?: string };
      return g.guardrail_name ?? "guardrail";
    }
    default:
      return data.type ?? "custom";
  }
}

function convertSpan(
  sdkSpan: AgentsSdkSpan,
  traceId: string
): { span: SpanRecord; handoffEdges: EdgeRecord[] } {
  const handoffEdges: EdgeRecord[] = [];
  const kind = mapKind(sdkSpan.span_data);
  const name = mapSpanName(sdkSpan.span_data);
  const status = mapStatus(sdkSpan.error);
  const data = sdkSpan.span_data;

  let payload: SpanRecord["payload"];

  if (data.type === "agent") {
    payload = {
      kind: "agent",
      ...(typeof data.name === "string" ? { agentName: data.name } : {}),
      ...(data.input !== undefined ? { input: data.input } : {}),
      ...(data.output !== undefined ? { output: data.output } : {}),
    };
  } else if (data.type === "response") {
    const rd = data as {
      type: "response";
      input?: unknown;
      response?: Record<string, unknown>;
      usage?: { input_tokens?: number; output_tokens?: number };
      model?: string;
    };
    payload = {
      kind: "llm",
      request: {
        model: rd.model ?? "unknown",
        ...(Array.isArray(rd.input) ? { messages: rd.input } : {}),
      },
      ...(rd.response !== undefined
        ? {
            response: {
              content: rd.response,
              ...(rd.model !== undefined ? { model: rd.model } : {}),
            },
          }
        : {}),
      ...(rd.usage !== undefined
        ? {
            usage: {
              input: rd.usage.input_tokens ?? 0,
              output: rd.usage.output_tokens ?? 0,
            },
          }
        : {}),
    };
  } else if (data.type === "function") {
    const fd = data as { type: "function"; name?: string; input?: unknown; output?: unknown };
    payload = {
      kind: "tool",
      tool: { name: fd.name ?? "unknown" },
      ...(fd.input !== undefined ? { input: fd.input } : {}),
      ...(fd.output !== undefined ? { output: fd.output } : {}),
    };
  } else if (data.type === "handoff") {
    const hd = data as { type: "handoff"; from_agent?: string; to_agent?: string; reason?: string };
    payload = {
      kind: "handoff",
      fromAgent: hd.from_agent ?? "unknown",
      toAgent: hd.to_agent ?? "unknown",
      ...(hd.reason !== undefined ? { reason: hd.reason } : {}),
    };
  } else if (data.type === "retrieval") {
    const rd = data as { type: "retrieval"; query?: string; results?: unknown[] };
    payload = {
      kind: "retrieval",
      ...(rd.query !== undefined ? { query: rd.query } : {}),
      ...(rd.results !== undefined ? { results: rd.results } : {}),
    };
  } else if (data.type === "guardrail") {
    const gd = data as { type: "guardrail"; guardrail_name?: string; outcome?: string; details?: unknown };
    payload = {
      kind: "guardrail",
      ...(gd.guardrail_name !== undefined ? { ruleName: gd.guardrail_name } : {}),
      ...(gd.outcome !== undefined ? { outcome: gd.outcome } : {}),
      ...(gd.details !== undefined ? { details: gd.details } : {}),
    };
  } else {
    payload = {
      kind: "custom",
      ...(data.type !== undefined ? { label: data.type } : {}),
    };
  }

  const sdkError = sdkSpan.error;
  const span: SpanRecord = {
    id: sdkSpan.span_id,
    traceId,
    ...(sdkSpan.parent_id !== undefined ? { parentSpanId: sdkSpan.parent_id } : {}),
    kind,
    name,
    status,
    provenance: "recorded",
    startedAt: sdkSpan.started_at ?? Date.now(),
    ...(sdkSpan.ended_at !== undefined ? { endedAt: sdkSpan.ended_at } : {}),
    ...(sdkError
      ? {
          error: {
            message: sdkError.message ?? "Unknown error",
            ...(sdkError.type !== undefined ? { type: sdkError.type } : {}),
            ...(sdkError.stack !== undefined ? { stack: sdkError.stack } : {}),
            ...(sdkError.code !== undefined ? { code: sdkError.code } : {}),
            ...(sdkError.retryable !== undefined ? { retryable: sdkError.retryable } : {}),
          },
        }
      : {}),
    payload,
    raw: sdkSpan,
  };

  if (data.type === "handoff" && sdkSpan.parent_id) {
    handoffEdges.push({
      id: ulid(),
      traceId,
      fromSpanId: sdkSpan.parent_id,
      toSpanId: sdkSpan.span_id,
      kind: "handoff",
    });
  }

  return { span, handoffEdges };
}

export const agentsSdkAdapter: TraceAdapter = {
  framework: "agents-sdk",

  canParse(input: unknown): boolean {
    return isAgentsSdkTrace(input);
  },

  normalize(input: unknown): TraceBundle {
    if (!isAgentsSdkTrace(input)) {
      throw new Error("Input does not match Agents SDK trace format");
    }

    const traceId = input.trace_id ?? ulid();
    const now = Date.now();
    const spans: SpanRecord[] = [];
    const edges: EdgeRecord[] = [];

    for (const sdkSpan of input.spans) {
      const { span, handoffEdges } = convertSpan(sdkSpan, traceId);
      spans.push(span);
      edges.push(...handoffEdges);
    }

    detectCycles(spans);
    const derivedSpans = deriveLatencies(spans);
    const { spans: normalizedSpans, rootSpanId } = ensureSingleRoot(traceId, derivedSpans);
    validateEdgeRefs(normalizedSpans, edges);

    const startedAt = Math.min(...normalizedSpans.map((s) => s.startedAt));
    const endedAts = normalizedSpans
      .map((s) => s.endedAt)
      .filter((e): e is number => e !== undefined);
    const endedAt =
      endedAts.length === normalizedSpans.length ? Math.max(...endedAts) : undefined;

    const hasErrors = normalizedSpans.some((s) => s.status === "error");
    const hasRunning = normalizedSpans.some((s) => s.status === "running");
    const traceStatus = hasErrors ? "error" : hasRunning ? "running" : "ok";

    const baseTrace: TraceRecord = {
      schemaVersion: 1,
      id: traceId,
      name: input.name ?? "Unnamed trace",
      framework: "agents-sdk",
      status: traceStatus,
      startedAt,
      ...(endedAt !== undefined ? { endedAt } : {}),
      createdAt: now,
      importedAt: now,
      updatedAt: now,
      rootSpanId,
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
    };

    const trace = deriveTotals(baseTrace, normalizedSpans);

    return { trace, spans: normalizedSpans, edges, rawSource: input };
  },
};
