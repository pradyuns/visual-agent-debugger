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

export interface FlowGraph {
  nodes: GraphNodeLayout[];
  edges: GraphEdgeLayout[];
  width: number;
  height: number;
}

/**
 * Returns spans in DFS pre-order, sorting siblings by `startedAt`.
 * If `rootSpanId` is provided and found, the walk starts from that span.
 * Otherwise, roots are discovered as spans with no `parentSpanId`.
 */
export function computeSpanOrder(
  spans: SpanRecord[],
  rootSpanId: string | undefined,
  childrenByParent: Map<string, SpanRecord[]>,
): SpanRecord[] {
  const visited = new Set<string>();
  const result: SpanRecord[] = [];

  const spanById = new Map<string, SpanRecord>();
  for (const span of spans) {
    spanById.set(span.id, span);
  }

  let roots: SpanRecord[];
  if (rootSpanId && spanById.has(rootSpanId)) {
    roots = [spanById.get(rootSpanId)!];
  } else {
    roots = spans
      .filter((span) => !span.parentSpanId)
      .sort((left, right) => left.startedAt - right.startedAt);
  }

  for (const root of roots) {
    walk(root, visited, result, childrenByParent);
  }

  return result;
}

function walk(
  span: SpanRecord,
  visited: Set<string>,
  result: SpanRecord[],
  childrenByParent: Map<string, SpanRecord[]>,
) {
  if (visited.has(span.id)) {
    return;
  }
  visited.add(span.id);
  result.push(span);

  const children = (childrenByParent.get(span.id) ?? []).sort(
    (left, right) => left.startedAt - right.startedAt,
  );

  for (const child of children) {
    walk(child, visited, result, childrenByParent);
  }
}

export function buildFlowGraph(bundle: TraceBundle): FlowGraph {
  const childrenByParent = new Map<string, SpanRecord[]>();

  for (const span of bundle.spans) {
    if (!span.parentSpanId) {
      continue;
    }
    const siblings = childrenByParent.get(span.parentSpanId) ?? [];
    siblings.push(span);
    childrenByParent.set(span.parentSpanId, siblings);
  }

  const orderedSpans = computeSpanOrder(bundle.spans, bundle.trace.rootSpanId, childrenByParent);

  const depthMap = new Map<string, number>();
  const laneCountByDepth = new Map<number, number>();

  // Compute depths via a second walk (reusing the ordered list)
  const spanById = new Map<string, SpanRecord>();
  for (const span of bundle.spans) {
    spanById.set(span.id, span);
  }
  for (const span of orderedSpans) {
    if (!span.parentSpanId || !depthMap.has(span.parentSpanId)) {
      depthMap.set(span.id, 0);
    } else {
      depthMap.set(span.id, depthMap.get(span.parentSpanId)! + 1);
    }
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
      (Math.max(...nodes.map((node) => node.x + node.width), NODE_WIDTH) || NODE_WIDTH) +
      48,
    height:
      (Math.max(...nodes.map((node) => node.y + node.height), NODE_HEIGHT) ||
        NODE_HEIGHT) + 48,
  };
}

/**
 * Returns a filtered copy of the graph containing only nodes whose ids are in
 * `visibleSpanIds` and edges where both endpoints are in the set.
 * Width and height are preserved from the original layout for stability.
 */
export function filterVisibleGraph(graph: FlowGraph, visibleSpanIds: Set<string>): FlowGraph {
  return {
    nodes: graph.nodes.filter((node) => visibleSpanIds.has(node.id)),
    edges: graph.edges.filter(
      (edge) => visibleSpanIds.has(edge.source) && visibleSpanIds.has(edge.target),
    ),
    width: graph.width,
    height: graph.height,
  };
}

export function getSpanAccent(kind: SpanRecord["kind"]) {
  return spanAccent[kind];
}
