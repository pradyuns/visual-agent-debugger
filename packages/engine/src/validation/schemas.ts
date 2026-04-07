import { z } from "zod";

export const SpanErrorSchema = z.object({
  message: z.string(),
  type: z.string().optional(),
  stack: z.string().optional(),
  code: z.string().optional(),
  retryable: z.boolean().optional(),
});

export const LlmRequestSchema = z.object({
  model: z.string().optional(),
  messages: z.array(z.unknown()).optional(),
  tools: z.array(z.unknown()).optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
}).passthrough();

export const LlmResponseSchema = z.object({
  model: z.string().optional(),
  choices: z.array(z.unknown()).optional(),
  content: z.unknown().optional(),
  finishReason: z.string().optional(),
}).passthrough();

export const TokenUsageSchema = z.object({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  total: z.number().int().nonnegative().optional(),
});

export const ToolInfoSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
}).passthrough();

export const SpanPayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("root"), summary: z.string().optional() }),
  z.object({
    kind: z.literal("agent"),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    agentName: z.string().optional(),
  }),
  z.object({
    kind: z.literal("llm"),
    request: LlmRequestSchema,
    response: LlmResponseSchema.optional(),
    usage: TokenUsageSchema.optional(),
  }),
  z.object({
    kind: z.literal("tool"),
    tool: ToolInfoSchema,
    input: z.unknown().optional(),
    output: z.unknown().optional(),
  }),
  z.object({
    kind: z.literal("handoff"),
    fromAgent: z.string(),
    toAgent: z.string(),
    reason: z.string().optional(),
  }),
  z.object({
    kind: z.literal("retrieval"),
    query: z.string().optional(),
    results: z.array(z.unknown()).optional(),
  }),
  z.object({
    kind: z.literal("guardrail"),
    ruleName: z.string().optional(),
    outcome: z.string().optional(),
    details: z.unknown().optional(),
  }),
  z.object({
    kind: z.literal("custom"),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    label: z.string().optional(),
  }),
]);

export const SpanRecordSchema = z.object({
  id: z.string().min(1),
  traceId: z.string().min(1),
  parentSpanId: z.string().optional(),
  kind: z.enum([
    "root",
    "agent",
    "llm",
    "tool",
    "handoff",
    "retrieval",
    "guardrail",
    "custom",
  ]),
  name: z.string().min(1),
  status: z.enum(["ok", "error", "running"]),
  provenance: z.enum(["recorded", "simulated", "live", "edited"]),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  latencyMs: z.number().nonnegative().optional(),
  error: SpanErrorSchema.optional(),
  stateSnapshot: z.record(z.unknown()).optional(),
  payload: SpanPayloadSchema,
  raw: z.unknown().optional(),
});

export const EdgeRecordSchema = z.object({
  id: z.string().min(1),
  traceId: z.string().min(1),
  fromSpanId: z.string().min(1),
  toSpanId: z.string().min(1),
  kind: z.enum(["handoff", "retry", "dependency", "correlation"]),
  metadata: z.record(z.unknown()).optional(),
});

export const TraceRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  framework: z.enum(["agents-sdk", "raw"]),
  status: z.enum(["ok", "error", "running"]),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  createdAt: z.number(),
  importedAt: z.number(),
  updatedAt: z.number(),
  rootSpanId: z.string().min(1),
  tags: z.array(z.string()),
  metadata: z.record(z.unknown()),
  totalTokens: z
    .object({
      input: z.number().int().nonnegative(),
      output: z.number().int().nonnegative(),
    })
    .optional(),
  totalCostUsd: z
    .object({
      input: z.number().nonnegative(),
      output: z.number().nonnegative(),
    })
    .optional(),
});

export const TraceBundleSchema = z.object({
  trace: TraceRecordSchema,
  spans: z.array(SpanRecordSchema),
  edges: z.array(EdgeRecordSchema),
  rawSource: z.unknown().optional(),
});
