import { ulid } from "ulid";
import type {
  EdgeRecord,
  SpanRecord,
  TokenUsage,
  TraceBundle,
  TraceStatus,
} from "../types";
import { traceBundleSchema } from "./schema";
import { TraceImportError } from "./errors";

export const MAX_TRACE_SPANS = 10_000;
export const MAX_TRACE_DEPTH = 512;

interface NormalizeOptions {
  importedAt?: number;
  traceId?: string;
  rawSource?: unknown;
}

export function normalizeTraceBundle(
  input: TraceBundle,
  options: NormalizeOptions = {},
): TraceBundle {
  if (input.spans.length > MAX_TRACE_SPANS) {
    throw new TraceImportError("trace_too_large", `Trace exceeds the limit of ${MAX_TRACE_SPANS} spans.`);
  }
  const importedAt = options.importedAt ?? Date.now();
  const traceId = options.traceId ?? ulid();

  const spans: SpanRecord[] = input.spans.map((span) => {
    const latencyMs =
      span.latencyMs ??
      (span.endedAt !== undefined ? Math.max(span.endedAt - span.startedAt, 0) : undefined);

    if (latencyMs === undefined) {
      return {
        ...span,
        traceId,
      };
    }

    return {
      ...span,
      traceId,
      latencyMs,
    };
  });
  const edges = input.edges.map((edge) => ({
    ...edge,
    traceId,
  }));

  if (spans.length === 0) {
    throw new TraceImportError(
      "empty_trace",
      "Imported traces must contain at least one span.",
    );
  }

  const spanMap = new Map(spans.map((span) => [span.id, span]));
  for (const span of spans) {
    if (span.parentSpanId && !spanMap.has(span.parentSpanId)) {
      throw new TraceImportError(
        "missing_parent",
        `Span "${span.id}" references missing parent "${span.parentSpanId}".`,
      );
    }
    if (span.parentSpanId === span.id) {
      throw new TraceImportError(
        "self_parent",
        `Span "${span.id}" cannot reference itself as a parent.`,
      );
    }
  }

  ensureAcyclic(spans);
  validateEdges(edges, spanMap);

  const rootCandidates = spans.filter((span) => span.parentSpanId === undefined);
  let rootSpanId = input.trace.rootSpanId;
  if (rootCandidates.length !== 1 || !spanMap.has(rootSpanId)) {
    const syntheticRoot = buildSyntheticRoot(spans, traceId);
    for (let index = 0; index < spans.length; index++) {
      const span = spans[index]!;
      if (span.parentSpanId !== undefined) continue;
      const nextRootCandidate = { ...span, parentSpanId: syntheticRoot.id };
      spans[index] = nextRootCandidate;
      spanMap.set(nextRootCandidate.id, nextRootCandidate);
    }
    spans.push(syntheticRoot);
    rootSpanId = syntheticRoot.id;
    spanMap.set(syntheticRoot.id, syntheticRoot);
  } else {
    const singleRoot = rootCandidates[0];
    if (!singleRoot) {
      throw new TraceImportError("missing_root", "Trace is missing a root span.");
    }
    rootSpanId = singleRoot.id;
  }

  const spanStart = Math.min(...spans.map((span) => span.startedAt));
  const definedSpanEnds = spans
    .map((span) => span.endedAt)
    .filter((value): value is number => value !== undefined);
  const spanEnd = definedSpanEnds.length > 0 ? Math.max(...definedSpanEnds) : undefined;
  const totalTokens = deriveTotalTokens(spans);
  const status = deriveStatus(spans);

  return traceBundleSchema.parse({
    trace: {
      ...input.trace,
      id: traceId,
      status,
      rootSpanId,
      startedAt: Math.min(input.trace.startedAt, spanStart),
      endedAt:
        spanEnd === undefined
          ? input.trace.endedAt
          : Math.max(input.trace.endedAt ?? spanEnd, spanEnd),
      createdAt: input.trace.createdAt || importedAt,
      importedAt,
      updatedAt: importedAt,
      totalTokens: totalTokens ?? input.trace.totalTokens,
    },
    spans,
    edges,
    rawSource: options.rawSource ?? input.rawSource,
  });
}

function buildSyntheticRoot(spans: SpanRecord[], traceId: string): SpanRecord {
  const startedAt = Math.min(...spans.map((span) => span.startedAt));
  const definedEnds = spans
    .map((span) => span.endedAt)
    .filter((value): value is number => value !== undefined);

  return {
    id: `root_${ulid()}`,
    traceId,
    kind: "root",
    name: "Imported trace root",
    status: deriveStatus(spans),
    provenance: "recorded",
    startedAt,
    endedAt: definedEnds.length > 0 ? Math.max(...definedEnds) : undefined,
    latencyMs:
      definedEnds.length > 0 ? Math.max(...definedEnds) - startedAt : undefined,
    payload: {
      kind: "root",
      summary: "Synthetic root created to normalize multiple top-level spans.",
    },
  };
}

function deriveTotalTokens(spans: SpanRecord[]): TokenUsage | undefined {
  let input = 0;
  let output = 0;

  for (const span of spans) {
    if (span.payload.kind !== "llm" || !span.payload.usage) {
      continue;
    }
    input += span.payload.usage.input;
    output += span.payload.usage.output;
  }

  if (input === 0 && output === 0) {
    return undefined;
  }

  return { input, output };
}

function deriveStatus(spans: Array<Pick<SpanRecord, "status">>): TraceStatus {
  if (spans.some((span) => span.status === "error")) {
    return "error";
  }
  if (spans.some((span) => span.status === "running")) {
    return "running";
  }
  return "ok";
}

function ensureAcyclic(spans: SpanRecord[]) {
  const depths = new Map<string, number>();
  const spanMap = new Map(spans.map((span) => [span.id, span]));

  for (const span of spans) {
    if (depths.has(span.id)) continue;
    const path: string[] = [];
    const inPath = new Set<string>();
    let current: string | undefined = span.id;
    while (current !== undefined && !depths.has(current)) {
      if (inPath.has(current)) {
        throw new TraceImportError("cycle_detected", `Cycle detected while traversing span "${current}".`);
      }
      const node: SpanRecord | undefined = spanMap.get(current);
      if (!node) throw new TraceImportError("missing_span", `Missing span "${current}".`);
      inPath.add(current);
      path.push(current);
      if (path.length > MAX_TRACE_DEPTH) {
        throw new TraceImportError("trace_too_deep", `Trace exceeds the limit of ${MAX_TRACE_DEPTH} nested spans.`);
      }
      current = node.parentSpanId;
    }
    let depth = current === undefined ? 0 : depths.get(current)!;
    while (path.length) {
      depth++;
      if (depth > MAX_TRACE_DEPTH) {
        throw new TraceImportError("trace_too_deep", `Trace exceeds the limit of ${MAX_TRACE_DEPTH} nested spans.`);
      }
      depths.set(path.pop()!, depth);
    }
  }
}

function validateEdges(
  edges: EdgeRecord[],
  spanMap: Map<string, SpanRecord>,
) {
  for (const edge of edges) {
    if (!spanMap.has(edge.fromSpanId) || !spanMap.has(edge.toSpanId)) {
      throw new TraceImportError(
        "missing_edge_reference",
        `Edge "${edge.id}" references a span that does not exist in the trace.`,
      );
    }
  }
}
