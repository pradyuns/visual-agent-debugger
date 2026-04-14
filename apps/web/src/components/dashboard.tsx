"use client";

import { startTransition, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TraceSummary, TraceStatus } from "@agent-debugger/engine";
import { formatDate, formatDuration, formatTokens } from "../lib/format";

interface DashboardProps {
  initialTraces: TraceSummary[];
}

export function Dashboard({ initialTraces }: DashboardProps) {
  const router = useRouter();
  const [traces, setTraces] = useState(initialTraces);
  const [framework, setFramework] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [deletingTraceId, setDeletingTraceId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);

  // Subscribe to live trace events via SSE
  useEffect(() => {
    const eventSource = new EventSource("/api/traces/stream");

    eventSource.addEventListener("trace:created", (event) => {
      try {
        const summary: TraceSummary = JSON.parse(event.data);
        setTraces((current) => [summary, ...current.filter((t) => t.id !== summary.id)]);
      } catch {
        // ignore parse errors
      }
    });

    eventSource.addEventListener("trace:status", (event) => {
      try {
        const { traceId, status: newStatus } = JSON.parse(event.data) as {
          traceId: string;
          status: TraceStatus;
        };
        setTraces((current) =>
          current.map((t) => (t.id === traceId ? { ...t, status: newStatus } : t)),
        );
      } catch {
        // ignore parse errors
      }
    });

    return () => eventSource.close();
  }, []);

  useEffect(() => {
    setCompareSelection((current) =>
      current.filter((traceId) => traces.some((trace) => trace.id === traceId)),
    );
  }, [traces]);

  async function refreshTraces(nextFramework = framework, nextStatus = status, nextSearch = search) {
    const params = new URLSearchParams();
    if (nextFramework !== "all") {
      params.set("framework", nextFramework);
    }
    if (nextStatus !== "all") {
      params.set("status", nextStatus);
    }
    if (nextSearch.trim()) {
      params.set("search", nextSearch.trim());
    }

    try {
      const response = await fetch(`/api/traces?${params.toString()}`);
      if (!response.ok) {
        setBannerError("Could not refresh traces.");
        return;
      }
      const payload = (await response.json()) as { traces: TraceSummary[] };
      setTraces(payload.traces);
    } catch (error) {
      setBannerError(getRequestFailureMessage(error, "Could not refresh traces."));
    }
  }

  async function handleUpload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) {
      return;
    }

    setBannerError(null);
    setIsImporting(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok) {
        setBannerError(payload.message ?? "Import failed.");
        return;
      }

      startTransition(() => {
        router.push(`/runs/${payload.traceId}`);
        router.refresh();
      });
    } catch (error) {
      setBannerError(getRequestFailureMessage(error, "Import failed."));
    } finally {
      setIsImporting(false);
    }
  }

  async function handleDelete(traceId: string, traceName: string) {
    if (!window.confirm(`Delete "${traceName}" from local storage?`)) {
      return;
    }

    setBannerError(null);
    setDeletingTraceId(traceId);

    try {
      const response = await fetch(`/api/traces/${traceId}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setBannerError(payload.message ?? "Delete failed.");
        return;
      }

      setTraces((current) => current.filter((trace) => trace.id !== traceId));
      void refreshTraces();
    } catch (error) {
      setBannerError(getRequestFailureMessage(error, "Delete failed."));
    } finally {
      setDeletingTraceId(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-6 py-8 sm:px-10">
      <header className="grid gap-6 rounded-[32px] border border-white/10 bg-ink/70 p-8 shadow-panel backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="text-sm uppercase tracking-[0.34em] text-tide/80">
              Agent Replay Debugger
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-smoke sm:text-5xl">
              Inspect agent runs like execution graphs, not loose logs.
            </h1>
            <p className="max-w-xl text-sm leading-6 text-slate-200">
              Import a canonical bundle or a saved OpenAI Agents SDK trace to
              get a local run list, graph view, and typed span inspector.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setCompareMode(!compareMode);
                setCompareSelection([]);
              }}
              className={`rounded-[24px] border px-6 py-4 text-sm font-medium transition hover:scale-[1.01] ${
                compareMode
                  ? "border-tide/60 bg-tide/20 text-tide"
                  : "border-white/20 bg-white/5 text-smoke"
              }`}
            >
              {compareMode ? "Cancel Compare" : "Compare"}
            </button>
            <label className="group relative flex cursor-pointer items-center justify-center rounded-[24px] border border-ember/60 bg-gradient-to-br from-ember/90 to-brass/80 px-6 py-4 text-sm font-medium text-ink transition hover:scale-[1.01]">
              <input
                className="hidden"
                type="file"
                accept="application/json"
                onChange={(event) => void handleUpload(event.target.files)}
              />
              {isImporting ? "Importing trace..." : "Import trace JSON"}
            </label>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr,160px,160px]">
          <input
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-smoke outline-none ring-0 placeholder:text-slate-400"
            value={search}
            onChange={(event) => {
              const value = event.target.value;
              setSearch(value);
              void refreshTraces(framework, status, value);
            }}
            placeholder="Search trace names"
          />
          <select
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-smoke outline-none"
            value={framework}
            onChange={(event) => {
              const value = event.target.value;
              setFramework(value);
              void refreshTraces(value, status, search);
            }}
          >
            <option value="all">All frameworks</option>
            <option value="raw">Canonical raw</option>
            <option value="agents-sdk">Agents SDK</option>
          </select>
          <select
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-smoke outline-none"
            value={status}
            onChange={(event) => {
              const value = event.target.value;
              setStatus(value);
              void refreshTraces(framework, value, search);
            }}
          >
            <option value="all">All statuses</option>
            <option value="ok">Ok</option>
            <option value="running">Running</option>
            <option value="error">Error</option>
          </select>
        </div>
        {bannerError ? (
          <p className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {bannerError}
          </p>
        ) : null}
      </header>

      <section className="rounded-[28px] border border-white/10 bg-slate/65 shadow-panel backdrop-blur">
        <div
          className={`grid gap-4 border-b border-white/10 px-5 py-4 text-xs uppercase tracking-[0.24em] text-slate-300 ${
            compareMode
              ? "grid-cols-[auto,2.1fr,1fr,1fr,1fr,1fr,auto]"
              : "grid-cols-[2.1fr,1fr,1fr,1fr,1fr,auto]"
          }`}
        >
          {compareMode ? <span>Select</span> : null}
          <span>Run</span>
          <span>Framework</span>
          <span>Status</span>
          <span>Started</span>
          <span>Tokens</span>
          <span className="text-right">Actions</span>
        </div>
        {traces.length === 0 ? (
          <div className="grid place-items-center px-6 py-24 text-center text-slate-300">
            <div className="max-w-md space-y-3">
              <p className="text-lg font-medium text-smoke">No traces loaded yet.</p>
              <p className="text-sm leading-6">
                Import `fixtures/traces/raw/canonical-trace.json` or one of the
                Agents SDK fixtures to populate the debugger.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {traces.map((trace) => (
              <div
                key={trace.id}
                className={`grid gap-4 px-5 py-5 transition hover:bg-white/5 ${
                  compareMode
                    ? "grid-cols-[auto,2.1fr,1fr,1fr,1fr,1fr,auto]"
                    : "grid-cols-[2.1fr,1fr,1fr,1fr,1fr,auto]"
                }`}
              >
                {compareMode ? (
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={compareSelection.includes(trace.id)}
                      onChange={() => {
                        setCompareSelection((prev) =>
                          prev.includes(trace.id)
                            ? prev.filter((id) => id !== trace.id)
                            : prev.length < 2
                              ? [...prev, trace.id]
                              : prev,
                        );
                      }}
                      disabled={
                        !compareSelection.includes(trace.id) &&
                        compareSelection.length >= 2
                      }
                      className="h-4 w-4 rounded border-white/20 bg-white/10 accent-tide"
                    />
                  </div>
                ) : null}
                <Link href={`/runs/${trace.id}`} className="space-y-2">
                  <p className="text-base font-medium text-smoke">{trace.name}</p>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                    {trace.spanCount} spans · {trace.errorCount} errors ·{" "}
                    {formatDuration(trace.durationMs)}
                  </p>
                </Link>
                <p className="text-sm text-slate-200">{trace.framework}</p>
                <p
                  className={`flex items-center gap-1.5 text-sm ${
                    trace.status === "error"
                      ? "text-rose-300"
                      : trace.status === "running"
                        ? "text-amber-200"
                        : "text-tide"
                  }`}
                >
                  {trace.status === "running" ? (
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  ) : null}
                  {trace.status}
                </p>
                <p className="text-sm text-slate-200">{formatDate(trace.startedAt)}</p>
                <p className="text-sm text-slate-200">{formatTokens(trace.totalTokens)}</p>
                <div className="flex items-start justify-end">
                  <button
                    type="button"
                    onClick={() => void handleDelete(trace.id, trace.name)}
                    disabled={deletingTraceId === trace.id}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.18em] text-slate-200 transition hover:border-rose-300/50 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingTraceId === trace.id ? "Deleting" : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {compareMode && compareSelection.length > 0 ? (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-[24px] border border-white/10 bg-ink/90 px-6 py-4 shadow-panel backdrop-blur">
          <p className="text-sm text-smoke">
            {compareSelection.length} of 2 selected
          </p>
          <button
            type="button"
            disabled={compareSelection.length !== 2}
            onClick={() => {
              router.push(
                `/compare?left=${compareSelection[0]}&right=${compareSelection[1]}`,
              );
            }}
            className="rounded-[20px] border border-tide/60 bg-tide/20 px-5 py-2.5 text-sm font-medium text-tide transition hover:bg-tide/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Compare
          </button>
        </div>
      ) : null}
    </div>
  );
}

function getRequestFailureMessage(error: unknown, fallback: string) {
  if (error instanceof TypeError) {
    return "Could not reach the server. Try again.";
  }

  return fallback;
}
