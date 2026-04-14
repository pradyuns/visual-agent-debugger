import type { SpanRecord, TraceBundle, TokenUsage } from "../types";

export interface SpanFieldChange {
  field: string;
  left: unknown;
  right: unknown;
}

export interface SpanDiff {
  path: string;
  left?: SpanRecord;
  right?: SpanRecord;
  status: "added" | "removed" | "changed" | "unchanged";
  changes?: SpanFieldChange[];
  latencyDelta?: number;
  tokenDelta?: { input: number; output: number };
}

export interface ComparisonSummary {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
  totalLatencyDelta: number;
  totalTokenDelta: { input: number; output: number };
}

export interface TraceComparison {
  left: TraceBundle;
  right: TraceBundle;
  diffs: SpanDiff[];
  summary: ComparisonSummary;
}

export function compareTraces(
  left: TraceBundle,
  right: TraceBundle,
): TraceComparison {
  const leftPaths = buildPathMap(left.spans);
  const rightPaths = buildPathMap(right.spans);

  const allPaths = [...new Set([...leftPaths.keys(), ...rightPaths.keys()])].sort();
  const diffs: SpanDiff[] = [];

  let added = 0;
  let removed = 0;
  let changed = 0;
  let unchanged = 0;
  let totalLatencyDelta = 0;
  const totalTokenDelta = { input: 0, output: 0 };

  for (const spanPath of allPaths) {
    const leftSpan = leftPaths.get(spanPath);
    const rightSpan = rightPaths.get(spanPath);

    if (leftSpan && !rightSpan) {
      removed++;
      diffs.push({ path: spanPath, left: leftSpan, status: "removed" });
      continue;
    }

    if (!leftSpan && rightSpan) {
      added++;
      diffs.push({ path: spanPath, right: rightSpan, status: "added" });
      continue;
    }

    if (leftSpan && rightSpan) {
      const changes = diffSpanFields(leftSpan, rightSpan);
      const latencyDelta = computeLatencyDelta(leftSpan, rightSpan);
      const tokenDelta = computeTokenDelta(leftSpan, rightSpan);

      const hasLatencyChange = latencyDelta !== undefined && latencyDelta !== 0;
      const hasTokenChange = tokenDelta !== undefined &&
        (tokenDelta.input !== 0 || tokenDelta.output !== 0);
      const isChanged = changes.length > 0 || hasLatencyChange || hasTokenChange;

      if (isChanged) {
        changed++;
        diffs.push({
          path: spanPath,
          left: leftSpan,
          right: rightSpan,
          status: "changed",
          changes: changes.length > 0 ? changes : undefined,
          latencyDelta,
          tokenDelta,
        });
      } else {
        unchanged++;
        diffs.push({
          path: spanPath,
          left: leftSpan,
          right: rightSpan,
          status: "unchanged",
          latencyDelta,
          tokenDelta,
        });
      }

      if (latencyDelta !== undefined) {
        totalLatencyDelta += latencyDelta;
      }
      if (tokenDelta) {
        totalTokenDelta.input += tokenDelta.input;
        totalTokenDelta.output += tokenDelta.output;
      }
    }
  }

  return {
    left,
    right,
    diffs,
    summary: {
      added,
      removed,
      changed,
      unchanged,
      totalLatencyDelta,
      totalTokenDelta,
    },
  };
}

/**
 * Build a map from structural path (e.g. "root:Root > agent:Triage > llm:Classify")
 * to span record. Siblings at the same path are disambiguated with a numeric suffix.
 */
function buildPathMap(spans: SpanRecord[]): Map<string, SpanRecord> {
  const byId = new Map(spans.map((s) => [s.id, s]));
  const result = new Map<string, SpanRecord>();
  const pathCounts = new Map<string, number>();

  function getAncestorPath(span: SpanRecord): string {
    if (!span.parentSpanId) return `${span.kind}:${span.name}`;
    const parent = byId.get(span.parentSpanId);
    if (!parent) return `${span.kind}:${span.name}`;
    return `${getAncestorPath(parent)} > ${span.kind}:${span.name}`;
  }

  // Sort by startedAt for stable sibling ordering
  const sorted = [...spans].sort((a, b) => a.startedAt - b.startedAt);

  for (const span of sorted) {
    let basePath = getAncestorPath(span);
    const count = pathCounts.get(basePath) ?? 0;
    pathCounts.set(basePath, count + 1);
    if (count > 0) {
      basePath = `${basePath}#${count}`;
    }
    result.set(basePath, span);
  }

  return result;
}

function diffSpanFields(
  left: SpanRecord,
  right: SpanRecord,
): SpanFieldChange[] {
  const changes: SpanFieldChange[] = [];

  if (left.status !== right.status) {
    changes.push({ field: "status", left: left.status, right: right.status });
  }

  if (JSON.stringify(left.error) !== JSON.stringify(right.error)) {
    changes.push({ field: "error", left: left.error, right: right.error });
  }

  // Compare payload (excluding timing-sensitive fields)
  const leftPayload = JSON.stringify(left.payload);
  const rightPayload = JSON.stringify(right.payload);
  if (leftPayload !== rightPayload) {
    changes.push({ field: "payload", left: left.payload, right: right.payload });
  }

  return changes;
}

function computeLatencyDelta(
  left: SpanRecord,
  right: SpanRecord,
): number | undefined {
  if (left.latencyMs != null && right.latencyMs != null) {
    return right.latencyMs - left.latencyMs;
  }
  return undefined;
}

function computeTokenDelta(
  left: SpanRecord,
  right: SpanRecord,
): { input: number; output: number } | undefined {
  const leftUsage = extractUsage(left);
  const rightUsage = extractUsage(right);

  if (leftUsage && rightUsage) {
    return {
      input: rightUsage.input - leftUsage.input,
      output: rightUsage.output - leftUsage.output,
    };
  }
  return undefined;
}

function extractUsage(span: SpanRecord): TokenUsage | undefined {
  if (span.payload.kind === "llm" && span.payload.usage) {
    return span.payload.usage;
  }
  return undefined;
}
