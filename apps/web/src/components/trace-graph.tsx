"use client";

import type { SpanRecord } from "@agent-debugger/engine";
import type { GraphEdgeLayout, GraphNodeLayout } from "../lib/graph";
import { getSpanAccent } from "../lib/graph";

interface TraceGraphProps {
  nodes: GraphNodeLayout[];
  edges: GraphEdgeLayout[];
  width: number;
  height: number;
  selectedSpanId: string;
  onSelectSpan: (spanId: string) => void;
}

export function TraceGraph({
  nodes,
  edges,
  width,
  height,
  selectedSpanId,
  onSelectSpan,
}: TraceGraphProps) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  return (
    <div className="overflow-auto rounded-[28px] border border-white/10 bg-[#071018]/80 shadow-panel">
      <div
        className="relative"
        style={{
          width,
          height,
          minHeight: 620,
        }}
      >
        <svg className="absolute inset-0 h-full w-full">
          {edges.map((edge) => {
            const source = nodeMap.get(edge.source);
            const target = nodeMap.get(edge.target);
            if (!source || !target) {
              return null;
            }

            const x1 = source.x + source.width;
            const y1 = source.y + source.height / 2;
            const x2 = target.x;
            const y2 = target.y + target.height / 2;
            const midX = (x1 + x2) / 2;

            return (
              <g key={edge.id}>
                <path
                  d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={edge.kind === "primary" ? "#41536c" : "#facc15"}
                  strokeDasharray={edge.kind === "primary" ? undefined : "7 5"}
                  strokeWidth={edge.kind === "primary" ? 1.4 : 1.8}
                />
                {edge.label ? (
                  <text
                    x={midX}
                    y={(y1 + y2) / 2 - 6}
                    fill="#f8fafc"
                    fontSize="11"
                    textAnchor="middle"
                  >
                    {edge.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>

        {nodes.map((node) => (
          <button
            key={node.id}
            type="button"
            onClick={() => onSelectSpan(node.id)}
            className="absolute rounded-[22px] bg-transparent text-left"
            style={{
              left: node.x,
              top: node.y,
              width: node.width,
              height: node.height,
            }}
          >
            <GraphNodeBody
              span={node.span}
              selected={node.id === selectedSpanId}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function GraphNodeBody({
  span,
  selected,
}: {
  span: SpanRecord;
  selected: boolean;
}) {
  return (
    <div
      className="flex h-full flex-col justify-between rounded-[22px] border px-4 py-3"
      style={{
        borderColor: selected ? "#f97316" : getSpanAccent(span.kind),
        background:
          "linear-gradient(180deg, rgba(12,18,28,0.96), rgba(8,12,20,0.88))",
        boxShadow: "0 18px 40px rgba(4, 8, 14, 0.35)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
            {span.kind}
          </p>
          <p className="mt-1 line-clamp-2 text-sm font-medium text-smoke">
            {span.name}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${
            selected ? "bg-ember text-ink" : "bg-white/10 text-slate-200"
          }`}
        >
          {span.status}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-300">
        <span>{span.provenance}</span>
        <span>{span.latencyMs !== undefined ? `${span.latencyMs} ms` : "Running"}</span>
      </div>
    </div>
  );
}
