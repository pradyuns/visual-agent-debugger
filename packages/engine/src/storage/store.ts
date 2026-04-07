import path from "node:path";
import os from "node:os";
import { eq, like, and, desc } from "drizzle-orm";
import type {
  TraceStore,
  TraceBundle,
  TraceSummary,
  TraceListFilters,
  TraceBundleWithDerived,
  SpanRecord,
} from "../types/index.js";
import { openDatabase, type Db } from "./db.js";
import {
  writeBundle,
  writeRawSource,
  readBundle,
  deleteTraceFiles,
  listTraceIds,
  ensureDataDir,
} from "./files.js";
import { traces, spans, edges } from "./schema.js";
import { detectAndNormalize } from "../adapters/index.js";
import { validateBundle } from "../validation/index.js";

function getDataDir(): string {
  return process.env["AGENT_DEBUGGER_HOME"] ?? path.join(os.homedir(), ".agent-debugger");
}

function buildChildrenMap(
  spanList: SpanRecord[]
): Map<string | undefined, SpanRecord[]> {
  const map = new Map<string | undefined, SpanRecord[]>();
  for (const span of spanList) {
    const key = span.parentSpanId;
    const existing = map.get(key) ?? [];
    existing.push(span);
    map.set(key, existing);
  }
  return map;
}

export class SqliteTraceStore implements TraceStore {
  private readonly db: Db;
  private readonly dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? getDataDir();
    const dbPath = path.join(this.dataDir, "index.db");
    this.db = openDatabase(dbPath);
  }

  async importTrace(
    input: unknown,
    _sourceName: string
  ): Promise<{ traceId: string }> {
    await ensureDataDir(this.dataDir);

    const bundle = detectAndNormalize(input);
    const { trace, spans: spanList, edges: edgeList, rawSource } = bundle;

    // Write files first
    await writeBundle(this.dataDir, trace.id, bundle);
    if (rawSource !== undefined) {
      await writeRawSource(this.dataDir, trace.id, rawSource);
    }

    // Update SQLite index in a single transaction
    const spanCount = spanList.length;
    const errorCount = spanList.filter((s) => s.status === "error").length;

    this.db.transaction((tx) => {
      // Remove existing rows if re-importing same ID
      tx.delete(traces).where(eq(traces.id, trace.id)).run();

      tx.insert(traces)
        .values({
          id: trace.id,
          name: trace.name,
          framework: trace.framework,
          status: trace.status,
          startedAt: trace.startedAt,
          ...(trace.endedAt !== undefined ? { endedAt: trace.endedAt } : {}),
          createdAt: trace.createdAt,
          importedAt: trace.importedAt,
          updatedAt: trace.updatedAt,
          rootSpanId: trace.rootSpanId,
          tags: JSON.stringify(trace.tags),
          ...(trace.totalTokens !== undefined ? { totalTokensInput: trace.totalTokens.input, totalTokensOutput: trace.totalTokens.output } : {}),
          ...(trace.totalCostUsd !== undefined ? { totalCostUsdInput: trace.totalCostUsd.input, totalCostUsdOutput: trace.totalCostUsd.output } : {}),
          spanCount,
          errorCount,
        })
        .run();

      for (const span of spanList) {
        const tokenInput = span.payload.kind === "llm" ? (span.payload.usage?.input ?? null) : null;
        const tokenOutput = span.payload.kind === "llm" ? (span.payload.usage?.output ?? null) : null;

        tx.insert(spans)
          .values({
            id: span.id,
            traceId: span.traceId,
            ...(span.parentSpanId !== undefined ? { parentSpanId: span.parentSpanId } : {}),
            kind: span.kind,
            name: span.name,
            status: span.status,
            provenance: span.provenance,
            startedAt: span.startedAt,
            ...(span.endedAt !== undefined ? { endedAt: span.endedAt } : {}),
            ...(span.latencyMs !== undefined ? { latencyMs: span.latencyMs } : {}),
            ...(tokenInput !== null ? { tokenInput } : {}),
            ...(tokenOutput !== null ? { tokenOutput } : {}),
          })
          .run();
      }

      for (const edge of edgeList) {
        tx.insert(edges)
          .values({
            id: edge.id,
            traceId: edge.traceId,
            fromSpanId: edge.fromSpanId,
            toSpanId: edge.toSpanId,
            kind: edge.kind,
          })
          .run();
      }
    });

    return { traceId: trace.id };
  }

  async listTraces(filters?: TraceListFilters): Promise<TraceSummary[]> {
    const conditions = [];

    if (filters?.framework) {
      conditions.push(eq(traces.framework, filters.framework));
    }
    if (filters?.status) {
      conditions.push(eq(traces.status, filters.status));
    }
    if (filters?.nameSearch) {
      conditions.push(like(traces.name, `%${filters.nameSearch}%`));
    }

    const query = this.db
      .select()
      .from(traces)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(traces.importedAt))
      .limit(filters?.limit ?? 100)
      .offset(filters?.offset ?? 0);

    const rows = query.all();

    const summaries: TraceSummary[] = [];
    for (const row of rows) {
      if (!filters?.tag) {
        summaries.push(rowToSummary(row));
        continue;
      }
      const tags = JSON.parse(row.tags) as string[];
      if (tags.includes(filters.tag)) {
        summaries.push(rowToSummary(row));
      }
    }

    return summaries;
  }

  async getTrace(traceId: string): Promise<TraceBundleWithDerived> {
    const raw = await readBundle(this.dataDir, traceId);
    const bundle = validateBundle(raw) as TraceBundle;
    const childrenByParent = buildChildrenMap(bundle.spans);
    return { ...bundle, childrenByParent };
  }

  async deleteTrace(traceId: string): Promise<void> {
    await deleteTraceFiles(this.dataDir, traceId);
    this.db.delete(traces).where(eq(traces.id, traceId)).run();
  }

  async rebuildIndex(): Promise<void> {
    const ids = await listTraceIds(this.dataDir);
    for (const id of ids) {
      try {
        const raw = await readBundle(this.dataDir, id);
        const bundle = validateBundle(raw) as TraceBundle;
        const { trace, spans: spanList, edges: edgeList } = bundle;
        const spanCount = spanList.length;
        const errorCount = spanList.filter((s) => s.status === "error").length;

        this.db.transaction((tx) => {
          tx.delete(traces).where(eq(traces.id, trace.id)).run();

          tx.insert(traces)
            .values({
              id: trace.id,
              name: trace.name,
              framework: trace.framework,
              status: trace.status,
              startedAt: trace.startedAt,
              ...(trace.endedAt !== undefined ? { endedAt: trace.endedAt } : {}),
              createdAt: trace.createdAt,
              importedAt: trace.importedAt,
              updatedAt: trace.updatedAt,
              rootSpanId: trace.rootSpanId,
              tags: JSON.stringify(trace.tags),
              ...(trace.totalTokens !== undefined ? { totalTokensInput: trace.totalTokens.input, totalTokensOutput: trace.totalTokens.output } : {}),
              spanCount,
              errorCount,
            })
            .run();

          for (const span of spanList) {
            tx.insert(spans)
              .values({
                id: span.id,
                traceId: span.traceId,
                ...(span.parentSpanId !== undefined ? { parentSpanId: span.parentSpanId } : {}),
                kind: span.kind,
                name: span.name,
                status: span.status,
                provenance: span.provenance,
                startedAt: span.startedAt,
                ...(span.endedAt !== undefined ? { endedAt: span.endedAt } : {}),
                ...(span.latencyMs !== undefined ? { latencyMs: span.latencyMs } : {}),
              })
              .run();
          }

          for (const edge of edgeList) {
            tx.insert(edges)
              .values({
                id: edge.id,
                traceId: edge.traceId,
                fromSpanId: edge.fromSpanId,
                toSpanId: edge.toSpanId,
                kind: edge.kind,
              })
              .run();
          }
        });
      } catch {
        // Skip corrupt bundles during rebuild
      }
    }
  }
}

type TraceRow = typeof traces.$inferSelect;

function rowToSummary(row: TraceRow): TraceSummary {
  const tags = JSON.parse(row.tags) as string[];
  return {
    id: row.id,
    name: row.name,
    framework: row.framework,
    status: row.status,
    startedAt: row.startedAt,
    ...(row.endedAt !== null ? { endedAt: row.endedAt } : {}),
    importedAt: row.importedAt,
    tags,
    ...(row.totalTokensInput !== null && row.totalTokensOutput !== null
      ? { totalTokens: { input: row.totalTokensInput, output: row.totalTokensOutput } }
      : {}),
    spanCount: row.spanCount,
    errorCount: row.errorCount,
  };
}
