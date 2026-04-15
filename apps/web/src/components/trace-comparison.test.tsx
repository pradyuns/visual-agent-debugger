import { fireEvent, render, screen } from "@testing-library/react";
import type { TraceComparison } from "@agent-debugger/engine";
import { TraceComparisonView } from "./trace-comparison";

function makeComparison(): TraceComparison {
  return {
    left: {
      trace: {
        schemaVersion: 1,
        id: "left",
        name: "Left Trace",
        framework: "raw",
        status: "ok",
        startedAt: 0,
        endedAt: 100,
        createdAt: 0,
        importedAt: 0,
        updatedAt: 0,
        rootSpanId: "root",
        tags: [],
        metadata: {},
      },
      spans: [
        {
          id: "root",
          traceId: "left",
          kind: "root",
          name: "Root",
          status: "ok",
          provenance: "recorded",
          startedAt: 0,
          latencyMs: 120,
          payload: { kind: "root" },
        },
      ],
      edges: [],
    },
    right: {
      trace: {
        schemaVersion: 1,
        id: "right",
        name: "Right Trace",
        framework: "raw",
        status: "ok",
        startedAt: 0,
        endedAt: 100,
        createdAt: 0,
        importedAt: 0,
        updatedAt: 0,
        rootSpanId: "root",
        tags: [],
        metadata: {},
      },
      spans: [
        {
          id: "root",
          traceId: "right",
          kind: "root",
          name: "Root",
          status: "ok",
          provenance: "recorded",
          startedAt: 0,
          latencyMs: 1620,
          payload: { kind: "root", summary: "updated" },
        },
      ],
      edges: [],
    },
    diffs: [
      {
        path: "root:Root",
        status: "changed",
        latencyDelta: 1500,
        tokenDelta: { input: 5, output: -2 },
        changes: [
          {
            field: "payload",
            left: { kind: "root" },
            right: { kind: "root", summary: "updated" },
          },
        ],
      },
    ],
    summary: {
      added: 0,
      removed: 0,
      changed: 1,
      unchanged: 0,
      totalLatencyDelta: 1500,
      totalTokenDelta: { input: 5, output: -2 },
    },
  };
}

describe("TraceComparisonView", () => {
  it("renders summary metrics and diff deltas", () => {
    render(<TraceComparisonView comparison={makeComparison()} />);

    expect(screen.getByText("Trace Comparison")).toBeTruthy();
    expect(screen.getByText("Span Diffs (1)")).toBeTruthy();
    expect(screen.getByText("Latency: +1.5 s")).toBeTruthy();
    expect(screen.getByText("Tokens: +5 in / -2 out")).toBeTruthy();
  });

  it("expands and collapses changed diff details", () => {
    render(<TraceComparisonView comparison={makeComparison()} />);

    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByText("payload")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByText("payload")).toBeNull();
  });
});
