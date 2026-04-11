import type { SpanEvent } from "@agent-debugger/engine";
import { getTraceStore } from "../../../../lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const store = getTraceStore();
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const listener = (event: SpanEvent) => {
        if (closed) return;
        if (event.type === "trace:created") {
          controller.enqueue(
            encoder.encode(`event: trace:created\ndata: ${JSON.stringify(event.summary)}\n\n`),
          );
        } else if (event.type === "trace:status") {
          controller.enqueue(
            encoder.encode(
              `event: trace:status\ndata: ${JSON.stringify({ traceId: event.traceId, status: event.status })}\n\n`,
            ),
          );
        }
      };

      store.on("trace:created", listener);
      store.on("trace:status", listener);

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          // stream closed
        }
      }, 15_000);

      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(heartbeat);
        store.off("trace:created", listener);
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
