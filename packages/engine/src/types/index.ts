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

export interface TokenUsage {
  input: number;
  output: number;
}

export interface LlmRequest {
  provider: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmResponse {
  message?: string;
  finishReason?: string;
  output?: unknown;
}

export interface ToolInfo {
  name: string;
  server?: string;
  version?: string;
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
  | {
      kind: "tool";
      tool: ToolInfo;
      input?: unknown;
      output?: unknown;
    }
  | { kind: "handoff"; fromAgent: string; toAgent: string; reason?: string }
  | { kind: "retrieval"; query?: string; results?: unknown[] }
  | { kind: "guardrail"; ruleName?: string; outcome?: string; details?: unknown }
  | { kind: "custom"; input?: unknown; output?: unknown; label?: string };

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
  totalTokens?: TokenUsage;
  totalCostUsd?: { input: number; output: number };
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
  error?: {
    message: string;
    type?: string;
    stack?: string;
    code?: string;
    retryable?: boolean;
  };
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

export interface TraceBundle {
  trace: TraceRecord;
  spans: SpanRecord[];
  edges: EdgeRecord[];
  rawSource?: unknown;
}

export interface TraceSummary {
  id: string;
  name: string;
  framework: TraceFramework;
  status: TraceStatus;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  updatedAt: number;
  tags: string[];
  totalTokens?: TokenUsage;
  totalCostUsd?: { input: number; output: number };
  spanCount: number;
  errorCount: number;
}

export interface TraceListFilters {
  framework?: TraceFramework;
  status?: TraceStatus;
  tag?: string;
  search?: string;
}

export interface TraceGraphData {
  childrenByParent: Record<string, string[]>;
}

export interface TraceAdapter {
  framework: TraceFramework;
  canParse(input: unknown): boolean;
  normalize(input: unknown): TraceBundle;
}

export type SpanEvent =
  | { type: "span:added"; traceId: string; span: SpanRecord }
  | { type: "span:updated"; traceId: string; span: SpanRecord }
  | { type: "trace:status"; traceId: string; status: TraceStatus }
  | { type: "trace:created"; summary: TraceSummary };

export interface TraceStore {
  importTrace(input: unknown, sourceName: string): Promise<{ traceId: string }>;
  listTraces(filters?: TraceListFilters): Promise<TraceSummary[]>;
  getTrace(traceId: string): Promise<TraceBundle>;
  deleteTrace(traceId: string): Promise<void>;
  rebuildIndex(): Promise<void>;
}
