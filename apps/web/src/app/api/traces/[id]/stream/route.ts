import type { SpanEvent } from "@agent-debugger/engine";
import { getTraceStore } from "../../../../../lib/store";
import { toErrorResponse } from "../../../../../lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: traceId } = await params;

  const store = getTraceStore();

  let bundle;
  try {
    bundle = await store.getTrace(traceId);
  } catch (error) {
    return toErrorResponse(error);
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial snapshot
      controller.enqueue(
        encoder.encode(`event: snapshot\ndata: ${JSON.stringify(bundle)}\n\n`),
      );

      const listener = (event: SpanEvent) => {
        if (closed) return;
        if (event.type === "span:added" || event.type === "span:updated") {
          controller.enqueue(
            encoder.encode(`event: span\ndata: ${JSON.stringify(event.span)}\n\n`),
          );
        } else if (event.type === "trace:status") {
          controller.enqueue(
            encoder.encode(`event: status\ndata: ${JSON.stringify({ status: event.status })}\n\n`),
          );
        }
      };

      store.on("span:added", listener);
      store.on("span:updated", listener);
      store.on("trace:status", listener);

      // Heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          // stream closed
        }
      }, 15_000);

      // Cleanup on cancel
      _request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(heartbeat);
        store.off("span:added", listener);
        store.off("span:updated", listener);
        store.off("trace:status", listener);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
