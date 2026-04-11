import { buildFlowGraph, computeSpanOrder, filterVisibleGraph } from "./graph";
import type { TraceBundle, SpanRecord } from "@agent-debugger/engine";

const bundle: TraceBundle = {
  trace: {
    schemaVersion: 1,
    id: "trace_graph",
    name: "Graph fixture",
    framework: "raw",
    status: "ok",
    startedAt: 100,
    endedAt: 400,
    createdAt: 100,
    importedAt: 100,
    updatedAt: 100,
    rootSpanId: "root",
    tags: [],
    metadata: {},
  },
  spans: [
    {
      id: "root",
      traceId: "trace_graph",
      kind: "root",
      name: "Root",
      status: "ok",
      provenance: "recorded",
      startedAt: 100,
      endedAt: 400,
      payload: { kind: "root" },
    },
    {
      id: "agent",
      traceId: "trace_graph",
      parentSpanId: "root",
      kind: "agent",
      name: "Agent",
      status: "ok",
      provenance: "recorded",
      startedAt: 120,
      endedAt: 300,
      payload: { kind: "agent", agentName: "Agent" },
    },
    {
      id: "tool",
      traceId: "trace_graph",
      parentSpanId: "agent",
      kind: "tool",
      name: "Tool",
      status: "ok",
      provenance: "recorded",
      startedAt: 180,
      endedAt: 240,
      payload: { kind: "tool", tool: { name: "lookup" } },
    },
  ],
  edges: [
    {
      id: "edge_handoff",
      traceId: "trace_graph",
      fromSpanId: "root",
      toSpanId: "tool",
      kind: "correlation",
    },
  ],
};

describe("buildFlowGraph", () => {
  it("lays out nodes left-to-right by depth and keeps secondary edges", () => {
    const graph = buildFlowGraph(bundle);
    const root = graph.nodes.find((node) => node.id === "root");
    const agent = graph.nodes.find((node) => node.id === "agent");
    const tool = graph.nodes.find((node) => node.id === "tool");

    expect(root).toBeDefined();
    expect(agent).toBeDefined();
    expect(tool).toBeDefined();
    expect(root!.x).toBeLessThan(agent!.x);
    expect(agent!.x).toBeLessThan(tool!.x);
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "edge_handoff",
          label: "correlation",
        }),
      ]),
    );
    expect(graph.width).toBeGreaterThan(0);
    expect(graph.height).toBeGreaterThan(0);
  });
});

describe("computeSpanOrder", () => {
  const spans = bundle.spans;

  function buildChildrenMap(spanList: SpanRecord[]) {
    const map = new Map<string, SpanRecord[]>();
    for (const span of spanList) {
      if (!span.parentSpanId) continue;
      const siblings = map.get(span.parentSpanId) ?? [];
      siblings.push(span);
      map.set(span.parentSpanId, siblings);
    }
    return map;
  }

  it("returns spans in DFS pre-order starting from rootSpanId", () => {
    const childrenByParent = buildChildrenMap(spans);
    const ordered = computeSpanOrder(spans, "root", childrenByParent);

    expect(ordered.map((s) => s.id)).toEqual(["root", "agent", "tool"]);
  });

  it("discovers roots automatically when rootSpanId is undefined", () => {
    const childrenByParent = buildChildrenMap(spans);
    const ordered = computeSpanOrder(spans, undefined, childrenByParent);

    expect(ordered.map((s) => s.id)).toEqual(["root", "agent", "tool"]);
  });

  it("sorts siblings by startedAt", () => {
    const extraSpans: SpanRecord[] = [
      ...spans,
      {
        id: "tool2",
        traceId: "trace_graph",
        parentSpanId: "agent",
        kind: "tool",
        name: "Tool2",
        status: "ok",
        provenance: "recorded",
        startedAt: 150,
        endedAt: 170,
        payload: { kind: "tool", tool: { name: "early_tool" } },
      },
    ];
    const childrenByParent = buildChildrenMap(extraSpans);
    const ordered = computeSpanOrder(extraSpans, "root", childrenByParent);

    // tool2 started at 150, tool started at 180, so tool2 should come first
    const ids = ordered.map((s) => s.id);
    expect(ids.indexOf("tool2")).toBeLessThan(ids.indexOf("tool"));
  });

  it("handles empty spans array", () => {
    const ordered = computeSpanOrder([], undefined, new Map());
    expect(ordered).toEqual([]);
  });
});

describe("filterVisibleGraph", () => {
  it("keeps only nodes and edges whose endpoints are in the visible set", () => {
    const graph = buildFlowGraph(bundle);
    const visible = new Set(["root", "agent"]);
    const filtered = filterVisibleGraph(graph, visible);

    expect(filtered.nodes.map((n) => n.id).sort()).toEqual(["agent", "root"]);
    // Only the primary edge root->agent should survive
    expect(filtered.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "root", target: "agent" }),
      ]),
    );
    // The edge root->tool (secondary) and agent->tool (primary) should be gone
    expect(filtered.edges.find((e) => e.target === "tool")).toBeUndefined();
  });

  it("preserves original width and height for stable layout", () => {
    const graph = buildFlowGraph(bundle);
    const filtered = filterVisibleGraph(graph, new Set(["root"]));

    expect(filtered.width).toBe(graph.width);
    expect(filtered.height).toBe(graph.height);
  });

  it("returns empty nodes and edges when visibility set is empty", () => {
    const graph = buildFlowGraph(bundle);
    const filtered = filterVisibleGraph(graph, new Set());

    expect(filtered.nodes).toEqual([]);
    expect(filtered.edges).toEqual([]);
    expect(filtered.width).toBe(graph.width);
    expect(filtered.height).toBe(graph.height);
  });

  it("returns all nodes and edges when all spans are visible", () => {
    const graph = buildFlowGraph(bundle);
    const allIds = new Set(graph.nodes.map((n) => n.id));
    const filtered = filterVisibleGraph(graph, allIds);

    expect(filtered.nodes.length).toBe(graph.nodes.length);
    expect(filtered.edges.length).toBe(graph.edges.length);
  });
});
