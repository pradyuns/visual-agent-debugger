"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { TraceBundle, TraceStatus } from "@agent-debugger/engine";
import { buildFlowGraph } from "../lib/graph";
import { formatDuration, formatTokens } from "../lib/format";
import { usePlaybackEngine } from "../hooks/use-playback-engine";
import { useTraceStream } from "../hooks/use-trace-stream";
import { SpanInspector } from "./span-inspector";
import { TraceGraph } from "./trace-graph";
import { TransportControls } from "./transport-controls";

interface RunViewerProps {
  bundle: TraceBundle;
}

export function RunViewer({ bundle }: RunViewerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isReplay = searchParams.get("replay") === "true";

  const [selectedSpanId, setSelectedSpanId] = useState(
    searchParams.get("span") ?? bundle.trace.rootSpanId,
  );

  const [traceStatus, setTraceStatus] = useState<TraceStatus>(bundle.trace.status);
  const isRunning = traceStatus === "running";

  const [playback, playbackControls] = usePlaybackEngine({
    spans: bundle.spans,
    rootSpanId: bundle.trace.rootSpanId,
    startAtEnd: !isReplay,
  });

  const handleStatusChange = useCallback((status: TraceStatus) => {
    setTraceStatus(status);
  }, []);

  const handleSnapshot = useCallback(
    (snapshot: TraceBundle) => {
      playbackControls.appendSpans(snapshot.spans);
      setTraceStatus(snapshot.trace.status);
    },
    [playbackControls],
  );

  useTraceStream({
    traceId: bundle.trace.id,
    enabled: isRunning,
    playbackControls,
    onSnapshot: handleSnapshot,
    onStatusChange: handleStatusChange,
  });

  const liveBundle = useMemo<TraceBundle>(
    () => ({
      ...bundle,
      trace: {
        ...bundle.trace,
        status: traceStatus,
      },
      spans: playback.allSpans,
    }),
    [bundle, playback.allSpans, traceStatus],
  );
  const graph = useMemo(() => buildFlowGraph(liveBundle), [liveBundle]);
  const selectedSpan =
    liveBundle.spans.find((span) => span.id === selectedSpanId) ??
    liveBundle.spans.find((span) => span.id === liveBundle.trace.rootSpanId) ??
    liveBundle.spans[0];

  useEffect(() => {
    const fromUrl = searchParams.get("span");
    if (fromUrl && fromUrl !== selectedSpanId) {
      setSelectedSpanId(fromUrl);
    }
  }, [searchParams]);

  function handleSelectSpan(spanId: string) {
    setSelectedSpanId(spanId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("span", spanId);
    router.replace(`?${params.toString()}`, { scroll: false });

    // In replay mode, seek to the clicked span's position
    if (isReplay) {
      const idx = playback.allSpans.findIndex((s: { id: string }) => s.id === spanId);
      if (idx >= 0) {
        playbackControls.seekTo(idx);
      }
    }
  }

  const errorCount = liveBundle.spans.filter((span) => span.error).length;
  const duration =
    liveBundle.trace.endedAt !== undefined
      ? Math.max(liveBundle.trace.endedAt - liveBundle.trace.startedAt, 0)
      : undefined;

  if (!selectedSpan) {
    return null;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-6 px-6 py-8 sm:px-10">
      <header className="grid gap-5 rounded-[30px] border border-white/10 bg-ink/70 p-7 shadow-panel backdrop-blur lg:grid-cols-[1.6fr,1fr]">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            {liveBundle.trace.framework}
          </p>
          <h1 className="flex items-center gap-3 text-4xl font-semibold tracking-tight text-smoke">
            {liveBundle.trace.name}
            {isRunning ? (
              <span className="flex items-center gap-1.5 rounded-lg bg-red-500/20 px-2 py-1 text-xs font-medium text-red-400">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
                Live
              </span>
            ) : null}
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-300">
            Graph view for imported spans, with typed payload inspection and
            secondary edges for handoffs or dependencies.
          </p>
        </div>
        <div className="grid gap-4 rounded-[24px] border border-white/10 bg-white/5 p-5 sm:grid-cols-2">
          <Metric label="Spans" value={String(liveBundle.spans.length)} />
          <Metric label="Errors" value={String(errorCount)} />
          <Metric label="Duration" value={formatDuration(duration)} />
          <Metric label="Tokens" value={formatTokens(liveBundle.trace.totalTokens)} />
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.4fr,0.9fr]">
        <TraceGraph
          nodes={graph.nodes}
          edges={graph.edges}
          width={graph.width}
          height={graph.height}
          selectedSpanId={selectedSpan.id}
          onSelectSpan={handleSelectSpan}
          visibleSpanIds={isReplay ? playback.visibleSpanIds : undefined}
        />
        <SpanInspector span={selectedSpan} />
      </div>

      {isReplay || isRunning ? (
        <TransportControls
          state={playback}
          controls={playbackControls}
          traceIsRunning={isRunning}
        />
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-ink/60 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-smoke">{value}</p>
    </div>
  );
}
