import { z } from "zod";

const recordSchema = z.record(z.string(), z.unknown());

export const tokenUsageSchema = z.object({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
});

export const llmRequestSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  messages: z.array(
    z.object({
      role: z.string().min(1),
      content: z.string(),
    }),
  ),
  systemPrompt: z.string().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().int().positive().optional(),
});

export const llmResponseSchema = z.object({
  message: z.string().optional(),
  finishReason: z.string().optional(),
  output: z.unknown().optional(),
});

export const toolInfoSchema = z.object({
  name: z.string().min(1),
  server: z.string().optional(),
  version: z.string().optional(),
});

export const traceStatusSchema = z.enum(["ok", "error", "running"]);
export const spanStatusSchema = traceStatusSchema;
export const spanKindSchema = z.enum([
  "root",
  "agent",
  "llm",
  "tool",
  "handoff",
  "retrieval",
  "guardrail",
  "custom",
]);
export const spanProvenanceSchema = z.enum([
  "recorded",
  "simulated",
  "live",
  "edited",
]);
export const edgeKindSchema = z.enum([
  "handoff",
  "retry",
  "dependency",
  "correlation",
]);
export const traceFrameworkSchema = z.enum(["agents-sdk", "raw"]);

export const errorSchema = z.object({
  message: z.string().min(1),
  type: z.string().optional(),
  stack: z.string().optional(),
  code: z.string().optional(),
  retryable: z.boolean().optional(),
});

export const spanPayloadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("root"),
    summary: z.string().optional(),
  }),
  z.object({
    kind: z.literal("agent"),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    agentName: z.string().optional(),
  }),
  z.object({
    kind: z.literal("llm"),
    request: llmRequestSchema,
    response: llmResponseSchema.optional(),
    usage: tokenUsageSchema.optional(),
  }),
  z.object({
    kind: z.literal("tool"),
    tool: toolInfoSchema,
    input: z.unknown().optional(),
    output: z.unknown().optional(),
  }),
  z.object({
    kind: z.literal("handoff"),
    fromAgent: z.string().min(1),
    toAgent: z.string().min(1),
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

export const traceRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  framework: traceFrameworkSchema,
  status: traceStatusSchema,
  startedAt: z.number().int(),
  endedAt: z.number().int().optional(),
  createdAt: z.number().int(),
  importedAt: z.number().int(),
  updatedAt: z.number().int(),
  rootSpanId: z.string().min(1),
  tags: z.array(z.string()),
  metadata: recordSchema,
  totalTokens: tokenUsageSchema.optional(),
  totalCostUsd: z
    .object({
      input: z.number().nonnegative(),
      output: z.number().nonnegative(),
    })
    .optional(),
});

export const spanRecordSchema = z.object({
  id: z.string().min(1),
  traceId: z.string().min(1),
  parentSpanId: z.string().min(1).optional(),
  kind: spanKindSchema,
  name: z.string().min(1),
  status: spanStatusSchema,
  provenance: spanProvenanceSchema,
  startedAt: z.number().int(),
  endedAt: z.number().int().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  error: errorSchema.optional(),
  stateSnapshot: recordSchema.optional(),
  payload: spanPayloadSchema,
  raw: z.unknown().optional(),
});

export const edgeRecordSchema = z.object({
  id: z.string().min(1),
  traceId: z.string().min(1),
  fromSpanId: z.string().min(1),
  toSpanId: z.string().min(1),
  kind: edgeKindSchema,
  metadata: recordSchema.optional(),
});

export const traceBundleSchema = z.object({
  trace: traceRecordSchema,
  spans: z.array(spanRecordSchema),
  edges: z.array(edgeRecordSchema).default([]),
  rawSource: z.unknown().optional(),
});

export const rawBundleFileSchema = traceBundleSchema.omit({ rawSource: true });

export type TraceBundleSchema = z.infer<typeof traceBundleSchema>;
