import { buildFlowGraph } from "./graph";
import type { TraceBundle } from "@agent-debugger/engine";

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
