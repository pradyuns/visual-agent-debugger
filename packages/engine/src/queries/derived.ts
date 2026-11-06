import type { SpanRecord, TraceBundle, TraceGraphData } from "../types";

export function buildChildrenByParent(spans: SpanRecord[]): Record<string, string[]> {
  const childrenByParent = new Map<string, string[]>();

  for (const span of spans) {
    if (!span.parentSpanId) continue;
    const children = childrenByParent.get(span.parentSpanId) ?? [];
    children.push(span.id);
    childrenByParent.set(span.parentSpanId, children);
  }

  // React Server Components require a plain object; fromEntries also creates
  // own properties for IDs such as "__proto__" without invoking its setter.
  return Object.fromEntries(childrenByParent);
}

export function buildTraceGraphData(bundle: TraceBundle): TraceGraphData {
  return {
    childrenByParent: buildChildrenByParent(bundle.spans),
  };
}
