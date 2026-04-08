"use client";

import { useState } from "react";
import type { SpanRecord } from "@agent-debugger/engine";
import { formatDuration } from "../lib/format";

interface SpanInspectorProps {
  span: SpanRecord;
}

const tabs = ["overview", "payload", "state", "raw"] as const;
type Tab = (typeof tabs)[number];

export function SpanInspector({ span }: SpanInspectorProps) {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="flex h-full flex-col rounded-[28px] border border-white/10 bg-ink/70 shadow-panel">
      <div className="border-b border-white/10 px-5 py-4">
        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
          Span Inspector
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-smoke">{span.name}</h2>
        <p className="mt-1 text-sm text-slate-300">
          {span.kind} · {span.provenance}
        </p>
      </div>

      <div className="flex gap-2 border-b border-white/10 px-4 py-3">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`rounded-full px-3 py-2 text-xs uppercase tracking-[0.18em] transition ${
              item === tab
                ? "bg-tide text-ink"
                : "bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-4 text-sm text-slate-100">
        {tab === "overview" ? (
          <div className="space-y-4">
            <KeyValue label="Status" value={span.status} />
            <KeyValue label="Started" value={String(span.startedAt)} />
            <KeyValue label="Duration" value={formatDuration(span.latencyMs)} />
            {span.error ? (
              <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-rose-200">
                  Error
                </p>
                <p className="mt-2 font-medium text-rose-100">{span.error.message}</p>
                {span.error.stack ? (
                  <pre className="mt-3 overflow-x-auto text-xs text-rose-100/80">
                    {span.error.stack}
                  </pre>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "payload" ? <JsonPanel value={span.payload} /> : null}
        {tab === "state" ? (
          span.stateSnapshot ? (
            <JsonPanel value={span.stateSnapshot} />
          ) : (
            <EmptyPanel copy="No state snapshot was captured for this span." />
          )
        ) : null}
        {tab === "raw" ? (
          span.raw ? (
            <JsonPanel value={span.raw} />
          ) : (
            <EmptyPanel copy="No raw framework payload is stored for this span." />
          )
        ) : null}
      </div>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="text-sm text-smoke">{value}</p>
    </div>
  );
}

function EmptyPanel({ copy }: { copy: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-slate-300">
      {copy}
    </div>
  );
}

function JsonPanel({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5 p-4 text-xs leading-6 text-slate-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
