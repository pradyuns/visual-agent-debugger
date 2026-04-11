"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { TraceBundle } from "@agent-debugger/engine";
import { buildFlowGraph, filterVisibleGraph } from "../lib/graph";
import { formatDuration, formatTokens } from "../lib/format";
import { usePlaybackEngine } from "../hooks/use-playback-engine";
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
  const selectedSpan =
    bundle.spans.find((span) => span.id === selectedSpanId) ??
    bundle.spans.find((span) => span.id === bundle.trace.rootSpanId) ??
    bundle.spans[0];

  const graph = useMemo(() => buildFlowGraph(bundle), [bundle]);

  const [playback, playbackControls] = usePlaybackEngine({
    spans: bundle.spans,
    rootSpanId: bundle.trace.rootSpanId,
    startAtEnd: !isReplay,
  });

  const visibleGraph = useMemo(
    () => filterVisibleGraph(graph, playback.visibleSpanIds),
    [graph, playback.visibleSpanIds],
  );

  useEffect(() => {
    const fromUrl = searchParams.get("span");
    if (fromUrl && fromUrl !== selectedSpanId) {
      setSelectedSpanId(fromUrl);
    }
  }, [searchParams, selectedSpanId]);

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

  const errorCount = bundle.spans.filter((span) => span.error).length;
  const duration =
    bundle.trace.endedAt !== undefined
      ? Math.max(bundle.trace.endedAt - bundle.trace.startedAt, 0)
      : undefined;

  if (!selectedSpan) {
    return null;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-6 px-6 py-8 sm:px-10">
      <header className="grid gap-5 rounded-[30px] border border-white/10 bg-ink/70 p-7 shadow-panel backdrop-blur lg:grid-cols-[1.6fr,1fr]">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            {bundle.trace.framework}
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-smoke">
            {bundle.trace.name}
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-300">
            Graph view for imported spans, with typed payload inspection and
            secondary edges for handoffs or dependencies.
          </p>
        </div>
        <div className="grid gap-4 rounded-[24px] border border-white/10 bg-white/5 p-5 sm:grid-cols-2">
          <Metric label="Spans" value={String(bundle.spans.length)} />
          <Metric label="Errors" value={String(errorCount)} />
          <Metric label="Duration" value={formatDuration(duration)} />
          <Metric label="Tokens" value={formatTokens(bundle.trace.totalTokens)} />
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

      {isReplay ? (
        <TransportControls
          state={playback}
          controls={playbackControls}
          traceIsRunning={bundle.trace.status === "running"}
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
