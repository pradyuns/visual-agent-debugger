import type { SpanEvent } from "@agent-debugger/engine";
import { getTraceStore } from "../../../../../lib/store";
import { toErrorResponse } from "../../../../../lib/errors";
import { formatTraceStreamEvent } from "../../../../../lib/trace-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: traceId } = await params;
  const store = getTraceStore();

  // Fail fast with a proper HTTP status before opening an SSE stream.
  try {
    await store.getTrace(traceId);
  } catch (error) {
    return toErrorResponse(error);
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      let snapshotSent = false;
      const pendingEvents: SpanEvent[] = [];

      const enqueueSse = (payload: string) => {
        if (closed) return;
        controller.enqueue(encoder.encode(payload));
      };

      const listener = (event: SpanEvent) => {
        const payload = formatTraceStreamEvent(event, traceId);
        if (!payload) return;
        if (!snapshotSent) {
          pendingEvents.push(event);
          return;
        }
        enqueueSse(payload);
      };

      store.on("span:added", listener);
      store.on("span:updated", listener);
      store.on("trace:status", listener);
      let heartbeat: ReturnType<typeof setInterval> | null = null;

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat !== null) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        store.off("span:added", listener);
        store.off("span:updated", listener);
        store.off("trace:status", listener);
      };

      // Heartbeat to keep connection alive
      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          enqueueSse(": heartbeat\n\n");
        } catch {
          // stream closed
        }
      }, 15_000);

      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // stream already closed
        }
      });

      try {
        // Subscribe first, then snapshot, so events during snapshot read are buffered.
        const bundle = await store.getTrace(traceId);
        enqueueSse(`event: snapshot\ndata: ${JSON.stringify(bundle)}\n\n`);
        snapshotSent = true;

        for (const event of pendingEvents) {
          const payload = formatTraceStreamEvent(event, traceId);
          if (payload) {
            enqueueSse(payload);
          }
        }
      } catch {
        cleanup();
        try {
          controller.close();
        } catch {
          // stream already closed
        }
        return;
      }
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
