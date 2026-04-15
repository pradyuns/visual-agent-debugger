import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import type { SpanRecord } from "@agent-debugger/engine";
import type { GraphNodeLayout } from "../lib/graph";
import { TraceGraph } from "./trace-graph";

function makeSpan(overrides: Partial<SpanRecord> = {}): SpanRecord {
  return {
    id: "span-1",
    traceId: "trace-1",
    kind: "custom",
    name: "Planner",
    status: "ok",
    provenance: "recorded",
    startedAt: 0,
    payload: { kind: "custom" },
    ...overrides,
  };
}

function makeNode(span: SpanRecord): GraphNodeLayout {
  return {
    id: span.id,
    x: 0,
    y: 0,
    width: 224,
    height: 88,
    span,
  };
}

describe("TraceGraph", () => {
  it("calls onSelectSpan when a visible node is clicked", () => {
    const span = makeSpan();
    const onSelectSpan = vi.fn();

    render(
      <TraceGraph
        nodes={[makeNode(span)]}
        edges={[]}
        width={300}
        height={200}
        selectedSpanId={span.id}
        onSelectSpan={onSelectSpan}
      />,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(onSelectSpan).toHaveBeenCalledWith(span.id);
  });

  it("disables ghost nodes", () => {
    const span = makeSpan();
    const onSelectSpan = vi.fn();

    render(
      <TraceGraph
        nodes={[makeNode(span)]}
        edges={[]}
        width={300}
        height={200}
        selectedSpanId={span.id}
        onSelectSpan={onSelectSpan}
        visibleSpanIds={new Set()}
      />,
    );

    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.click(button);
    expect(onSelectSpan).not.toHaveBeenCalled();
  });
});
