import { describe, expect, it } from "vitest";
import type { SpanRecord } from "@agent-debugger/engine";
import { formatTraceStreamEvent } from "./route";

function makeSpan(id: string): SpanRecord {
  return {
    id,
    traceId: "trace-a",
    kind: "custom",
    name: id,
    status: "running",
    provenance: "live",
    startedAt: 1,
    payload: { kind: "custom" },
  };
}

describe("formatTraceStreamEvent", () => {
  it("drops events for other trace ids", () => {
    const payload = formatTraceStreamEvent(
      { type: "span:added", traceId: "trace-b", span: makeSpan("s1") },
      "trace-a",
    );
    expect(payload).toBeNull();
  });

  it("formats span events for the requested trace", () => {
    const payload = formatTraceStreamEvent(
      { type: "span:updated", traceId: "trace-a", span: makeSpan("s1") },
      "trace-a",
    );

    expect(payload).toContain("event: span");
    expect(payload).toContain("\"id\":\"s1\"");
  });

  it("formats status events for the requested trace", () => {
    const payload = formatTraceStreamEvent(
      { type: "trace:status", traceId: "trace-a", status: "ok" },
      "trace-a",
    );

    expect(payload).toBe("event: status\ndata: {\"status\":\"ok\"}\n\n");
  });
});
