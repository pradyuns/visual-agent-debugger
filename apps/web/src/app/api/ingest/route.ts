import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getTraceStore } from "../../../lib/store";
import { toErrorResponse } from "../../../lib/errors";

const SAFE_TRACE_ID = /^[A-Za-z0-9_-]+$/;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ingestSchema = z.object({
  traceId: z.string().optional(),
  traceName: z.string().optional(),
  framework: z.enum(["agents-sdk", "raw"]).optional(),
  spans: z
    .array(
      z.object({
        id: z.string(),
        traceId: z.string().optional(),
        parentSpanId: z.string().optional(),
        kind: z.enum(["root", "agent", "llm", "tool", "handoff", "retrieval", "guardrail", "custom"]),
        name: z.string(),
        status: z.enum(["ok", "error", "running"]),
        provenance: z.enum(["recorded", "simulated", "live", "edited"]),
        startedAt: z.number(),
        endedAt: z.number().optional(),
        latencyMs: z.number().optional(),
        error: z
          .object({
            message: z.string(),
            type: z.string().optional(),
            stack: z.string().optional(),
            code: z.string().optional(),
            retryable: z.boolean().optional(),
          })
          .optional(),
        stateSnapshot: z.record(z.unknown()).optional(),
        payload: z.record(z.unknown()),
        raw: z.unknown().optional(),
      }),
    )
    .min(1),
  edges: z
    .array(
      z.object({
        id: z.string(),
        traceId: z.string().optional(),
        fromSpanId: z.string(),
        toSpanId: z.string(),
        kind: z.enum(["handoff", "retry", "dependency", "correlation"]),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .optional(),
});

function normalizeHost(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    const idx = trimmed.indexOf("]");
    if (idx > 0) {
      return trimmed.slice(1, idx);
    }
    return trimmed;
  }
  return trimmed.split(":")[0] ?? trimmed;
}

function isLoopbackHost(value: string | null) {
  if (!value) return false;
  return LOOPBACK_HOSTS.has(normalizeHost(value));
}

function isLoopbackIp(value: string | null) {
  if (!value) return false;
  const ip = value.split(",")[0]?.trim() ?? "";
  if (!ip) return false;
  if (ip === "::1" || ip === "127.0.0.1") return true;
  if (ip.startsWith("::ffff:")) {
    return ip.slice("::ffff:".length) === "127.0.0.1";
  }
  return false;
}

function readBearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token;
}

export function authorizeIngestRequest(request: Request) {
  const requiredToken = process.env.AGENT_DEBUGGER_INGEST_TOKEN;
  const suppliedToken = readBearerToken(request.headers.get("authorization"));
  if (requiredToken) {
    if (suppliedToken === requiredToken) {
      return { ok: true as const };
    }
    return {
      ok: false as const,
      status: 401,
      error: "unauthorized",
      message: "Missing or invalid bearer token.",
    };
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const hostHeader = request.headers.get("host");
  const hostIsLoopback = isLoopbackHost(forwardedHost) || isLoopbackHost(hostHeader);

  let requestUrlHost = "";
  try {
    requestUrlHost = new URL(request.url).host;
  } catch {
    requestUrlHost = "";
  }

  if (!hostIsLoopback && !isLoopbackHost(requestUrlHost)) {
    return {
      ok: false as const,
      status: 403,
      error: "forbidden",
      message:
        "Remote ingest requires AGENT_DEBUGGER_INGEST_TOKEN. Without it, only loopback hosts are allowed.",
    };
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  if (forwardedFor && !isLoopbackIp(forwardedFor)) {
    return {
      ok: false as const,
      status: 403,
      error: "forbidden",
      message: "Remote ingest is blocked without AGENT_DEBUGGER_INGEST_TOKEN.",
    };
  }
  if (realIp && !isLoopbackIp(realIp)) {
    return {
      ok: false as const,
      status: 403,
      error: "forbidden",
      message: "Remote ingest is blocked without AGENT_DEBUGGER_INGEST_TOKEN.",
    };
  }

  return { ok: true as const };
}

export async function POST(request: Request) {
  try {
    const auth = authorizeIngestRequest(request);
    if (!auth.ok) {
      return Response.json(
        { error: auth.error, message: auth.message },
        { status: auth.status },
      );
    }

    const body = await request.json();
    const parsed = ingestSchema.parse(body);

    const traceId = parsed.traceId ?? `trace_${randomUUID().replace(/-/g, "")}`;
    if (!SAFE_TRACE_ID.test(traceId)) {
      return Response.json(
        { error: "invalid_trace_id", message: "Trace ID contains unsupported characters." },
        { status: 400 },
      );
    }

    const spans = parsed.spans.map((s) => ({
      ...s,
      traceId,
    }));

    const store = getTraceStore();
    const result = await store.upsertSpans(traceId, spans as any, {
      traceName: parsed.traceName,
      framework: parsed.framework,
    });

    return Response.json(
      { traceId: result.traceId, spansAdded: result.spansAdded },
      { status: 201 },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
