import type { SpanEvent } from "@agent-debugger/engine";

export function formatTraceStreamEvent(event: SpanEvent, traceId: string): string | null {
  if ("traceId" in event && event.traceId !== traceId) {
    return null;
  }

  if (event.type === "span:added" || event.type === "span:updated") {
    return `event: span\ndata: ${JSON.stringify(event.span)}\n\n`;
  }

  if (event.type === "trace:status") {
    return `event: status\ndata: ${JSON.stringify({ status: event.status })}\n\n`;
  }

  return null;
}
