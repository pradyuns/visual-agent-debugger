import type { SpanRecord, TraceBundle, TraceGraphData } from "../types";

export function buildChildrenByParent(spans: SpanRecord[]): Record<string, string[]> {
  const childrenByParent: Record<string, string[]> = {};

  for (const span of spans) {
    if (!span.parentSpanId) {
      continue;
    }
    const children = childrenByParent[span.parentSpanId] ?? [];
    children.push(span.id);
    childrenByParent[span.parentSpanId] = children;
  }

  return childrenByParent;
}

export function buildTraceGraphData(bundle: TraceBundle): TraceGraphData {
  return {
    childrenByParent: buildChildrenByParent(bundle.spans),
  };
}
