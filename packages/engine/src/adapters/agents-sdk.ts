import { ulid } from "ulid";
import type {
  EdgeRecord,
  SpanPayload,
  TraceAdapter,
  TraceBundle,
  TraceRecord,
} from "../types";
import {
  errorSchema,
  spanStatusSchema,
  tokenUsageSchema,
  toolInfoSchema,
} from "../validation/schema";
import { TraceImportError } from "../validation/errors";
import { z } from "zod";

const agentsTraceSchema = z.object({
  source: z.literal("openai-agents-sdk"),
  version: z.number().int().default(1),
  trace: z.object({
    id: z.string().min(1).optional(),
    name: z.string().min(1),
    startedAt: z.number().int(),
    endedAt: z.number().int().optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
    tags: z.array(z.string()).default([]),
  }),
  spans: z.array(
    z.object({
      id: z.string().min(1),
      parentId: z.string().min(1).optional(),
      type: z.enum([
        "agent",
        "llm",
        "tool",
        "handoff",
        "retrieval",
        "guardrail",
        "custom",
      ]),
      name: z.string().min(1),
      status: spanStatusSchema.default("ok"),
      startedAt: z.number().int(),
      endedAt: z.number().int().optional(),
      input: z.unknown().optional(),
      output: z.unknown().optional(),
      state: z.record(z.string(), z.unknown()).optional(),
      error: errorSchema.optional(),
      usage: tokenUsageSchema.optional(),
      model: z
        .object({
          provider: z.string().min(1),
          name: z.string().min(1),
          systemPrompt: z.string().optional(),
          temperature: z.number().optional(),
          maxTokens: z.number().int().positive().optional(),
        })
        .optional(),
      messages: z
        .array(
          z.object({
            role: z.string().min(1),
            content: z.string(),
          }),
        )
        .optional(),
      tool: toolInfoSchema.optional(),
      handoff: z
        .object({
          fromAgent: z.string().min(1),
          toAgent: z.string().min(1),
          toSpanId: z.string().min(1).optional(),
          reason: z.string().optional(),
        })
        .optional(),
      metadata: z.record(z.string(), z.unknown()).default({}),
    }),
  ),
});

export class AgentsSdkTraceAdapter implements TraceAdapter {
  readonly framework = "agents-sdk" as const;

  canParse(input: unknown): boolean {
    return agentsTraceSchema.safeParse(input).success;
  }

  normalize(input: unknown): TraceBundle {
    const parsed = agentsTraceSchema.safeParse(input);
    if (!parsed.success) {
      throw new TraceImportError(
        "invalid_agents_trace",
        "Invalid OpenAI Agents SDK trace format.",
        { issues: parsed.error.issues },
      );
    }

    const createdAt = Date.now();
    const traceId = parsed.data.trace.id ?? ulid();
    const edges: EdgeRecord[] = [];
    const spans = parsed.data.spans.map((span) => {
      const payload = mapPayload(span);
      if (span.type === "handoff" && span.handoff?.toSpanId) {
        edges.push({
          id: `edge_${span.id}`,
          traceId,
          fromSpanId: span.parentId ?? span.id,
          toSpanId: span.handoff.toSpanId,
          kind: "handoff",
          metadata: {
            fromAgent: span.handoff.fromAgent,
            toAgent: span.handoff.toAgent,
          },
        });
      }

      return {
        id: span.id,
        traceId,
        parentSpanId: span.parentId,
        kind: payload.kind,
        name: span.name,
        status: span.status,
        provenance: "recorded" as const,
        startedAt: span.startedAt,
        endedAt: span.endedAt,
        latencyMs:
          span.endedAt !== undefined
            ? Math.max(span.endedAt - span.startedAt, 0)
            : undefined,
        error: span.error,
        stateSnapshot: span.state,
        payload,
        raw: span,
      };
    });

    const trace: TraceRecord = {
      schemaVersion: 1,
      id: traceId,
      name: parsed.data.trace.name,
      framework: "agents-sdk",
      status: spans.some((span) => span.status === "error")
        ? "error"
        : spans.some((span) => span.status === "running")
          ? "running"
          : "ok",
      startedAt: parsed.data.trace.startedAt,
      endedAt: parsed.data.trace.endedAt,
      createdAt,
      importedAt: createdAt,
      updatedAt: createdAt,
      rootSpanId: spans[0]?.id ?? "",
      tags: parsed.data.trace.tags,
      metadata: {
        ...parsed.data.trace.metadata,
        source: parsed.data.source,
        version: parsed.data.version,
      },
    };

    return {
      trace,
      spans,
      edges,
      rawSource: input,
    };
  }
}

function mapPayload(span: z.infer<typeof agentsTraceSchema>["spans"][number]): SpanPayload {
  switch (span.type) {
    case "agent":
      return {
        kind: "agent",
        input: span.input,
        output: span.output,
        agentName:
          typeof span.metadata.agentName === "string"
            ? span.metadata.agentName
            : span.name,
      };
    case "llm":
      return {
        kind: "llm",
        request: {
          provider: span.model?.provider ?? "openai",
          model: span.model?.name ?? "unknown",
          messages: span.messages ?? [],
          systemPrompt: span.model?.systemPrompt,
          temperature: span.model?.temperature,
          maxTokens: span.model?.maxTokens,
        },
        response:
          span.output === undefined
            ? undefined
            : {
                output: span.output,
                message:
                  typeof span.output === "string" ? span.output : undefined,
              },
        usage: span.usage,
      };
    case "tool":
      return {
        kind: "tool",
        tool: span.tool ?? { name: span.name },
        input: span.input,
        output: span.output,
      };
    case "handoff":
      return {
        kind: "handoff",
        fromAgent: span.handoff?.fromAgent ?? "unknown",
        toAgent: span.handoff?.toAgent ?? "unknown",
        reason: span.handoff?.reason,
      };
    case "retrieval":
      return {
        kind: "retrieval",
        query: typeof span.input === "string" ? span.input : undefined,
        results: Array.isArray(span.output) ? span.output : undefined,
      };
    case "guardrail":
      return {
        kind: "guardrail",
        ruleName: span.name,
        outcome: typeof span.output === "string" ? span.output : undefined,
        details: span.output,
      };
    case "custom":
      return {
        kind: "custom",
        input: span.input,
        output: span.output,
        label: span.name,
      };
    default:
      return {
        kind: "custom",
        input: span.input,
        output: span.output,
        label: span.name,
      };
  }
}
