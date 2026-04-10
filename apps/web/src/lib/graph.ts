import type { EdgeRecord, SpanRecord, TraceBundle } from "@agent-debugger/engine";

const NODE_WIDTH = 224;
const NODE_HEIGHT = 88;
const COLUMN_GAP = 64;
const ROW_GAP = 40;

const spanAccent: Record<SpanRecord["kind"], string> = {
  root: "#d2a53b",
  agent: "#5cd1b0",
  llm: "#67b0ff",
  tool: "#f97316",
  handoff: "#facc15",
  retrieval: "#f59e0b",
  guardrail: "#fb7185",
  custom: "#c084fc",
};

export interface GraphNodeLayout {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  span: SpanRecord;
}

export interface GraphEdgeLayout {
  id: string;
  source: string;
  target: string;
  kind: "primary" | EdgeRecord["kind"];
  label?: string;
}

export function buildFlowGraph(bundle: TraceBundle) {
  const childrenByParent = new Map<string, SpanRecord[]>();

  for (const span of bundle.spans) {
    if (!span.parentSpanId) {
      continue;
    }
    const siblings = childrenByParent.get(span.parentSpanId) ?? [];
    siblings.push(span);
    childrenByParent.set(span.parentSpanId, siblings);
  }

  const depthMap = new Map<string, number>();
  const laneCountByDepth = new Map<number, number>();
  const orderedSpans: SpanRecord[] = [];
  const roots = bundle.spans
    .filter((span) => !span.parentSpanId)
    .sort((left, right) => left.startedAt - right.startedAt);

  for (const root of roots) {
    walk(root, 0);
  }

  const nodes: GraphNodeLayout[] = orderedSpans.map((span) => {
    const depth = depthMap.get(span.id) ?? 0;
    const lane = laneCountByDepth.get(depth) ?? 0;
    laneCountByDepth.set(depth, lane + 1);

    return {
      id: span.id,
      x: depth * (NODE_WIDTH + COLUMN_GAP),
      y: lane * (NODE_HEIGHT + ROW_GAP),
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      span,
    };
  });

  const primaryEdges: GraphEdgeLayout[] = bundle.spans
    .filter((span) => span.parentSpanId)
    .map((span) => ({
      id: `parent_${span.parentSpanId}_${span.id}`,
      source: span.parentSpanId!,
      target: span.id,
      kind: "primary",
    }));

  const secondaryEdges = bundle.edges.map((edge) => ({
    id: edge.id,
    source: edge.fromSpanId,
    target: edge.toSpanId,
    kind: edge.kind,
    label: edge.kind,
  }));

  return {
    nodes,
    edges: [...primaryEdges, ...secondaryEdges],
    width:
      (Math.max(...nodes.map((node) => node.x + node.width), NODE_WIDTH) ?? NODE_WIDTH) +
      48,
    height:
      (Math.max(...nodes.map((node) => node.y + node.height), NODE_HEIGHT) ??
        NODE_HEIGHT) + 48,
  };

  function walk(span: SpanRecord, depth: number) {
    if (depthMap.has(span.id)) {
      return;
    }
    depthMap.set(span.id, depth);
    orderedSpans.push(span);

    const children = (childrenByParent.get(span.id) ?? []).sort(
      (left, right) => left.startedAt - right.startedAt,
    );

    for (const child of children) {
      walk(child, depth + 1);
    }
  }
}

export function getSpanAccent(kind: SpanRecord["kind"]) {
  return spanAccent[kind];
}
