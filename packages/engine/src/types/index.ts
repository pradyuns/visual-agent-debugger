export type TraceFramework = "agents-sdk" | "raw";
export type TraceStatus = "ok" | "error" | "running";
export type SpanStatus = "ok" | "error" | "running";
export type SpanKind =
  | "root"
  | "agent"
  | "llm"
  | "tool"
  | "handoff"
  | "retrieval"
  | "guardrail"
  | "custom";
export type SpanProvenance = "recorded" | "simulated" | "live" | "edited";
export type EdgeKind = "handoff" | "retry" | "dependency" | "correlation";

export interface LlmRequest {
  model?: string;
  messages?: unknown[];
  tools?: unknown[];
  temperature?: number;
  maxTokens?: number;
  [key: string]: unknown;
}

export interface LlmResponse {
  model?: string;
  choices?: unknown[];
  content?: unknown;
  finishReason?: string;
  [key: string]: unknown;
}

export interface TokenUsage {
  input: number;
  output: number;
  total?: number;
}

export interface ToolInfo {
  name: string;
  description?: string;
  [key: string]: unknown;
}

export type SpanPayload =
  | { kind: "root"; summary?: string }
  | { kind: "agent"; input?: unknown; output?: unknown; agentName?: string }
  | {
      kind: "llm";
      request: LlmRequest;
      response?: LlmResponse;
      usage?: TokenUsage;
    }
  | { kind: "tool"; tool: ToolInfo; input?: unknown; output?: unknown }
  | { kind: "handoff"; fromAgent: string; toAgent: string; reason?: string }
  | { kind: "retrieval"; query?: string; results?: unknown[] }
  | {
      kind: "guardrail";
      ruleName?: string;
      outcome?: string;
      details?: unknown;
    }
  | { kind: "custom"; input?: unknown; output?: unknown; label?: string };

export interface SpanError {
  message: string;
  type?: string;
  stack?: string;
  code?: string;
  retryable?: boolean;
}

export interface SpanRecord {
  id: string;
  traceId: string;
  parentSpanId?: string;
  kind: SpanKind;
  name: string;
  status: SpanStatus;
  provenance: SpanProvenance;
  startedAt: number;
  endedAt?: number;
  latencyMs?: number;
  error?: SpanError;
  stateSnapshot?: Record<string, unknown>;
  payload: SpanPayload;
  raw?: unknown;
}

export interface EdgeRecord {
  id: string;
  traceId: string;
  fromSpanId: string;
  toSpanId: string;
  kind: EdgeKind;
  metadata?: Record<string, unknown>;
}

export interface TraceRecord {
  schemaVersion: 1;
  id: string;
  name: string;
  framework: TraceFramework;
  status: TraceStatus;
  startedAt: number;
  endedAt?: number;
  createdAt: number;
  importedAt: number;
  updatedAt: number;
  rootSpanId: string;
  tags: string[];
  metadata: Record<string, unknown>;
  totalTokens?: { input: number; output: number };
  totalCostUsd?: { input: number; output: number };
}

export interface TraceBundle {
  trace: TraceRecord;
  spans: SpanRecord[];
  edges: EdgeRecord[];
  rawSource?: unknown;
}

export interface TraceAdapter {
  framework: TraceFramework;
  canParse(input: unknown): boolean;
  normalize(input: unknown): TraceBundle;
}

export interface TraceListFilters {
  framework?: TraceFramework;
  status?: TraceStatus;
  tag?: string;
  nameSearch?: string;
  limit?: number;
  offset?: number;
}

export interface TraceSummary {
  id: string;
  name: string;
  framework: TraceFramework;
  status: TraceStatus;
  startedAt: number;
  endedAt?: number;
  importedAt: number;
  tags: string[];
  totalTokens?: { input: number; output: number };
  spanCount?: number;
  errorCount?: number;
}

export interface TraceBundleWithDerived extends TraceBundle {
  childrenByParent: Map<string | undefined, SpanRecord[]>;
}

export interface TraceStore {
  importTrace(
    input: unknown,
    sourceName: string
  ): Promise<{ traceId: string }>;
  listTraces(filters?: TraceListFilters): Promise<TraceSummary[]>;
  getTrace(traceId: string): Promise<TraceBundleWithDerived>;
  deleteTrace(traceId: string): Promise<void>;
  rebuildIndex(): Promise<void>;
}
