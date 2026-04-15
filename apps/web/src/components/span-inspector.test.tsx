import { fireEvent, render, screen } from "@testing-library/react";
import type { SpanRecord } from "@agent-debugger/engine";
import { SpanInspector } from "./span-inspector";

function makeSpan(overrides: Partial<SpanRecord> = {}): SpanRecord {
  return {
    id: "span-1",
    traceId: "trace-1",
    kind: "custom",
    name: "Planner",
    status: "ok",
    provenance: "recorded",
    startedAt: 1000,
    payload: { kind: "custom", output: { note: "hello" } },
    ...overrides,
  };
}

describe("SpanInspector", () => {
  it("switches tabs and renders payload JSON", () => {
    const span = makeSpan({
      stateSnapshot: { step: 1 },
      raw: { framework: "raw" },
    });
    render(<SpanInspector span={span} />);

    fireEvent.click(screen.getByRole("button", { name: "payload" }));
    expect(screen.getByText(/"note": "hello"/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "state" }));
    expect(screen.getByText(/"step": 1/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "raw" }));
    expect(screen.getByText(/"framework": "raw"/)).toBeTruthy();
  });

  it("renders empty-state copy when optional panels are missing", () => {
    render(<SpanInspector span={makeSpan()} />);

    fireEvent.click(screen.getByRole("button", { name: "state" }));
    expect(screen.getByText("No state snapshot was captured for this span.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "raw" }));
    expect(screen.getByText("No raw framework payload is stored for this span.")).toBeTruthy();
  });
});
