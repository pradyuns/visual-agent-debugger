"use client";

import { useState } from "react";
import Link from "next/link";
import type { TraceComparison, SpanDiff } from "@agent-debugger/engine";
import { formatDuration } from "../lib/format";

interface TraceComparisonViewProps {
  comparison: TraceComparison;
}

export function TraceComparisonView({ comparison }: TraceComparisonViewProps) {
  const { left, right, diffs, summary } = comparison;
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  function toggleExpanded(path: string) {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-6 px-6 py-8 sm:px-10">
      {/* Header */}
      <header className="rounded-[30px] border border-white/10 bg-ink/70 p-7 shadow-panel backdrop-blur">
        <div className="mb-5 flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Trace Comparison
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-smoke">
              {left.trace.name}
              <span className="mx-3 text-slate-500">vs</span>
              {right.trace.name}
            </h1>
          </div>
          <Link
            href="/"
            className="rounded-[20px] border border-white/20 bg-white/5 px-4 py-2 text-sm text-smoke transition hover:bg-white/10"
          >
            Back
          </Link>
        </div>

        {/* Summary metrics */}
        <div className="grid gap-4 sm:grid-cols-5">
          <SummaryCard label="Unchanged" value={summary.unchanged} color="text-slate-300" />
          <SummaryCard label="Changed" value={summary.changed} color="text-ember" />
          <SummaryCard label="Added" value={summary.added} color="text-tide" />
          <SummaryCard label="Removed" value={summary.removed} color="text-rose-400" />
          <SummaryCard
            label="Latency Delta"
            value={summary.totalLatencyDelta === 0 ? "0 ms" : formatDelta(summary.totalLatencyDelta)}
            color={
              summary.totalLatencyDelta > 0
                ? "text-rose-400"
                : summary.totalLatencyDelta < 0
                  ? "text-tide"
                  : "text-slate-300"
            }
          />
        </div>
      </header>

      {/* Side-by-side trace info */}
      <div className="grid gap-6 md:grid-cols-2">
        <TraceCard
          label="Left"
          name={left.trace.name}
          framework={left.trace.framework}
          spanCount={left.spans.length}
          status={left.trace.status}
        />
        <TraceCard
          label="Right"
          name={right.trace.name}
          framework={right.trace.framework}
          spanCount={right.spans.length}
          status={right.trace.status}
        />
      </div>

      {/* Diff list */}
      <section className="rounded-[28px] border border-white/10 bg-slate/65 shadow-panel backdrop-blur">
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-300">
            Span Diffs ({diffs.length})
          </p>
        </div>
        <div className="divide-y divide-white/5">
          {diffs.map((diff) => (
            <DiffRow
              key={diff.path}
              diff={diff}
              isSelected={selectedPath === diff.path}
              isExpanded={expandedPaths.has(diff.path)}
              onSelect={() => setSelectedPath(diff.path)}
              onToggle={() => toggleExpanded(diff.path)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-ink/60 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function TraceCard({
  label,
  name,
  framework,
  spanCount,
  status,
}: {
  label: string;
  name: string;
  framework: string;
  spanCount: number;
  status: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-ink/60 p-5">
      <p className="mb-2 text-xs uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="text-lg font-semibold text-smoke">{name}</p>
      <p className="mt-1 text-xs text-slate-400">
        {framework} · {spanCount} spans · {status}
      </p>
    </div>
  );
}

const STATUS_STYLES: Record<string, { badge: string; border: string }> = {
  unchanged: { badge: "bg-slate-500/20 text-slate-300", border: "border-white/5" },
  changed: { badge: "bg-ember/20 text-ember", border: "border-ember/30" },
  added: { badge: "bg-tide/20 text-tide", border: "border-tide/30" },
  removed: { badge: "bg-rose-500/20 text-rose-400", border: "border-rose-400/30" },
};

function DiffRow({
  diff,
  isSelected,
  isExpanded,
  onSelect,
  onToggle,
}: {
  diff: SpanDiff;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const style = STATUS_STYLES[diff.status] ?? { badge: "bg-slate-500/20 text-slate-300", border: "border-white/5" };
  const hasDetails = diff.status === "changed" && diff.changes && diff.changes.length > 0;

  return (
    <div
      className={`px-5 py-4 transition ${isSelected ? "bg-white/5" : ""} ${style.border}`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            onSelect();
            if (hasDetails) onToggle();
          }}
          className="flex-1 text-left"
        >
          <div className="flex items-center gap-3">
            <span className={`rounded-lg px-2 py-1 text-xs font-medium ${style.badge}`}>
              {diff.status}
            </span>
            <span className="font-mono text-sm text-smoke">{diff.path}</span>
          </div>
          {diff.latencyDelta !== undefined && diff.latencyDelta !== 0 ? (
            <p className="mt-1 text-xs text-slate-400">
              Latency: {formatDelta(diff.latencyDelta)}
            </p>
          ) : null}
          {diff.tokenDelta &&
          (diff.tokenDelta.input !== 0 || diff.tokenDelta.output !== 0) ? (
            <p className="mt-0.5 text-xs text-slate-400">
              Tokens: {formatSignedNumber(diff.tokenDelta.input)} in /{" "}
              {formatSignedNumber(diff.tokenDelta.output)} out
            </p>
          ) : null}
        </button>
        {hasDetails ? (
          <button
            type="button"
            onClick={onToggle}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300 transition hover:bg-white/10"
          >
            {isExpanded ? "Hide" : "Details"}
          </button>
        ) : null}
      </div>

      {isExpanded && diff.changes ? (
        <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
          {diff.changes.map((change) => (
            <div key={change.field} className="rounded-xl bg-ink/40 p-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                {change.field}
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-lg border border-rose-400/20 bg-rose-500/5 p-2">
                  <p className="mb-1 text-[10px] uppercase tracking-widest text-rose-400">
                    Left
                  </p>
                  <pre className="overflow-auto whitespace-pre-wrap font-mono text-xs text-slate-200">
                    {typeof change.left === "string"
                      ? change.left
                      : JSON.stringify(change.left, null, 2)}
                  </pre>
                </div>
                <div className="rounded-lg border border-tide/20 bg-tide/5 p-2">
                  <p className="mb-1 text-[10px] uppercase tracking-widest text-tide">
                    Right
                  </p>
                  <pre className="overflow-auto whitespace-pre-wrap font-mono text-xs text-slate-200">
                    {typeof change.right === "string"
                      ? change.right
                      : JSON.stringify(change.right, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatDelta(ms: number): string {
  const sign = ms > 0 ? "+" : "";
  if (Math.abs(ms) < 1000) return `${sign}${ms} ms`;
  return `${sign}${(ms / 1000).toFixed(1)} s`;
}

function formatSignedNumber(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}
