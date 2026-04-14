import Database from "better-sqlite3";
import { EventEmitter } from "node:events";
import type {
  EdgeRecord,
  SpanEvent,
  SpanPayload,
  SpanRecord,
  TraceAdapter,
  TraceBundle,
  TraceListFilters,
  TraceRecord,
  TraceStore,
  TraceSummary,
  TokenUsage,
} from "../types";
import { defaultAdapters } from "../adapters";
import { buildTraceGraphData } from "../queries/derived";
import { normalizeTraceBundle } from "../validation/normalize";
import { TraceImportError } from "../validation/errors";
import { assertSafeTraceId } from "./paths";
import { createRedactor } from "../redaction/redactor";
import { getPatternsByNames } from "../redaction/patterns";
import type { UpsertSpansOptions } from "./trace-store";

const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS traces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  framework TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ok','error','running')),
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  created_at INTEGER NOT NULL,
  imported_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  root_span_id TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  metadata TEXT NOT NULL DEFAULT '{}',
  total_tokens_input INTEGER,
  total_tokens_output INTEGER,
  total_cost_input REAL,
  total_cost_output REAL,
  span_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS spans (
  id TEXT NOT NULL,
  trace_id TEXT NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
  parent_span_id TEXT,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  provenance TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  latency_ms INTEGER,
  error TEXT,
  state_snapshot TEXT,
  payload TEXT NOT NULL,
  raw TEXT,
  PRIMARY KEY (id, trace_id)
);

CREATE TABLE IF NOT EXISTS edges (
  id TEXT NOT NULL,
  trace_id TEXT NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
  from_span_id TEXT NOT NULL,
  to_span_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  metadata TEXT,
  PRIMARY KEY (id, trace_id)
);

CREATE TABLE IF NOT EXISTS raw_sources (
  trace_id TEXT PRIMARY KEY REFERENCES traces(id) ON DELETE CASCADE,
  source TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_traces_framework ON traces(framework);
CREATE INDEX IF NOT EXISTS idx_traces_status ON traces(status);
CREATE INDEX IF NOT EXISTS idx_traces_started_at ON traces(started_at);
CREATE INDEX IF NOT EXISTS idx_spans_trace_id ON spans(trace_id);
`;

export interface SqliteTraceStoreOptions {
  dbPath: string;
  adapters?: TraceAdapter[];
}

export class SqliteTraceStore implements TraceStore {
  private readonly db: Database.Database;
  private readonly adapters: TraceAdapter[];
  private readonly emitter = new EventEmitter();
  private readonly redactor?: ReturnType<typeof createRedactor>;

  constructor(options: SqliteTraceStoreOptions) {
    this.db = new Database(options.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA_DDL);
    this.adapters = options.adapters ?? defaultAdapters;

    const redactEnv = process.env.AGENT_DEBUGGER_REDACT;
    if (redactEnv) {
      const names = redactEnv.split(",").map((s) => s.trim());
      const patterns = getPatternsByNames(names);
      if (patterns.length > 0) {
        this.redactor = createRedactor({ patterns });
      }
    }
  }

  on(event: string, listener: (evt: SpanEvent) => void) {
    this.emitter.on(event, listener);
    return this;
  }

  off(event: string, listener: (evt: SpanEvent) => void) {
    this.emitter.off(event, listener);
    return this;
  }

  private emit(event: SpanEvent) {
    this.emitter.emit(event.type, event);
  }

  async importTrace(input: unknown, sourceName: string) {
    const adapter = this.adapters.find((a) => a.canParse(input));
    if (!adapter) {
      throw new TraceImportError(
        "unsupported_format",
        `Unsupported trace format for "${sourceName}".`,
      );
    }

    let normalized = normalizeTraceBundle(adapter.normalize(input), {
      rawSource: input,
    });

    if (this.redactor) {
      normalized = {
        ...normalized,
        trace: {
          ...normalized.trace,
          name: this.redactor.redact(normalized.trace.name),
          tags: this.redactor.redact(normalized.trace.tags),
          metadata: this.redactor.redact(normalized.trace.metadata),
        },
        spans: this.redactor.redact(normalized.spans),
        rawSource: this.redactor.redact(normalized.rawSource),
      };
    }

    this.insertBundle(normalized);
    this.emit({ type: "trace:created", summary: this.traceToSummary(normalized.trace, normalized.spans) });

    return { traceId: normalized.trace.id };
  }

  async upsertSpans(
    traceId: string,
    spans: SpanRecord[],
    options: UpsertSpansOptions = {},
  ): Promise<{ traceId: string; spansAdded: number; spansUpdated: number }> {
    assertSafeTraceId(traceId);

    const redactedSpans = this.redactor ? this.redactor.redact(spans) : spans;

    const existingTrace = this.db
      .prepare("SELECT id FROM traces WHERE id = ?")
      .get(traceId) as { id: string } | undefined;

    const isNew = !existingTrace;
    let spansAdded = 0;
    let spansUpdated = 0;
    const events: SpanEvent[] = [];

    const insertOrReplace = this.db.prepare(`
      INSERT OR REPLACE INTO spans (id, trace_id, parent_span_id, kind, name, status,
        provenance, started_at, ended_at, latency_ms, error, state_snapshot, payload, raw)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const txn = this.db.transaction(() => {
      if (isNew) {
        const now = Date.now();
        const startedAt = Math.min(...redactedSpans.map((s) => s.startedAt));
        const rootSpanId =
          redactedSpans.find((s) => !s.parentSpanId)?.id ??
          redactedSpans[0]?.id ??
          traceId;

        this.db.prepare(`
          INSERT INTO traces (id, name, framework, status, started_at, created_at,
            imported_at, updated_at, root_span_id, tags, metadata, span_count, error_count)
          VALUES (?, ?, ?, 'running', ?, ?, ?, ?, ?, '[]', '{}', 0, 0)
        `).run(
          traceId,
          options.traceName ?? traceId,
          options.framework ?? "raw",
          startedAt,
          now, now, now,
          rootSpanId,
        );
      }

      for (const span of redactedSpans) {
        const existing = this.db
          .prepare("SELECT id FROM spans WHERE id = ? AND trace_id = ?")
          .get(span.id, traceId) as { id: string } | undefined;

        insertOrReplace.run(
          span.id,
          traceId,
          span.parentSpanId ?? null,
          span.kind,
          span.name,
          span.status,
          span.provenance,
          span.startedAt,
          span.endedAt ?? null,
          span.latencyMs ?? null,
          span.error ? JSON.stringify(span.error) : null,
          span.stateSnapshot ? JSON.stringify(span.stateSnapshot) : null,
          JSON.stringify(span.payload),
          span.raw !== undefined ? JSON.stringify(span.raw) : null,
        );

        if (existing) {
          spansUpdated++;
          events.push({ type: "span:updated", traceId, span });
        } else {
          spansAdded++;
          events.push({ type: "span:added", traceId, span });
        }
      }

      // Update trace metadata
      const allSpans = this.db
        .prepare("SELECT status FROM spans WHERE trace_id = ?")
        .all(traceId) as { status: string }[];

      const spanCount = allSpans.length;
      const errorCount = allSpans.filter((s) => s.status === "error").length;

      this.db.prepare(`
        UPDATE traces SET updated_at = ?, span_count = ?, error_count = ? WHERE id = ?
      `).run(Date.now(), spanCount, errorCount, traceId);
    });

    txn();

    if (isNew) {
      const trace = this.loadTraceRecord(traceId)!;
      const allSpans = this.loadSpans(traceId);
      this.emit({ type: "trace:created", summary: this.traceToSummary(trace, allSpans) });
    }
    for (const event of events) {
      this.emit(event);
    }

    return { traceId, spansAdded, spansUpdated };
  }

  async listTraces(filters: TraceListFilters = {}): Promise<TraceSummary[]> {
    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];

    if (filters.framework) {
      conditions.push("framework = ?");
      params.push(filters.framework);
    }
    if (filters.status) {
      conditions.push("status = ?");
      params.push(filters.status);
    }
    if (filters.tag) {
      conditions.push("tags LIKE ?");
      params.push(`%${filters.tag}%`);
    }
    if (filters.search) {
      conditions.push("name LIKE ?");
      params.push(`%${filters.search}%`);
    }

    const rows = this.db
      .prepare(`SELECT * FROM traces WHERE ${conditions.join(" AND ")} ORDER BY started_at DESC`)
      .all(...params) as TraceRow[];

    return rows.map(rowToSummary);
  }

  async getTrace(traceId: string) {
    assertSafeTraceId(traceId);

    const traceRow = this.db
      .prepare("SELECT * FROM traces WHERE id = ?")
      .get(traceId) as TraceRow | undefined;

    if (!traceRow) {
      throw new TraceImportError(
        "trace_not_found",
        `Trace "${traceId}" was not found.`,
        { status: 404 },
      );
    }

    const trace = rowToTraceRecord(traceRow);
    const spans = this.loadSpans(traceId);
    const edges = this.loadEdges(traceId);

    const rawRow = this.db
      .prepare("SELECT source FROM raw_sources WHERE trace_id = ?")
      .get(traceId) as { source: string } | undefined;

    const bundle: TraceBundle = {
      trace,
      spans,
      edges,
      rawSource: rawRow ? JSON.parse(rawRow.source) : undefined,
    };

    return {
      ...bundle,
      graph: buildTraceGraphData(bundle),
    } as TraceBundle & { graph: ReturnType<typeof buildTraceGraphData> };
  }

  async deleteTrace(traceId: string) {
    assertSafeTraceId(traceId);

    const exists = this.db
      .prepare("SELECT id FROM traces WHERE id = ?")
      .get(traceId) as { id: string } | undefined;

    if (!exists) {
      throw new TraceImportError(
        "trace_not_found",
        `Trace "${traceId}" was not found.`,
        { status: 404 },
      );
    }

    this.db.prepare("DELETE FROM traces WHERE id = ?").run(traceId);
  }

  async rebuildIndex() {
    // No-op for SQLite — the tables are the index
  }

  close() {
    this.db.close();
  }

  importBundle(bundle: TraceBundle) {
    this.insertBundle(bundle);
  }

  // --- Private helpers ---

  private insertBundle(bundle: TraceBundle) {
    const txn = this.db.transaction(() => {
      const trace = bundle.trace;
      const errorCount = bundle.spans.filter((s) => s.error).length;

      this.db.prepare(`
        INSERT OR REPLACE INTO traces (id, name, framework, status, started_at, ended_at,
          created_at, imported_at, updated_at, root_span_id, tags, metadata,
          total_tokens_input, total_tokens_output, total_cost_input, total_cost_output,
          span_count, error_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        trace.id, trace.name, trace.framework, trace.status,
        trace.startedAt, trace.endedAt ?? null,
        trace.createdAt, trace.importedAt, trace.updatedAt,
        trace.rootSpanId,
        JSON.stringify(trace.tags),
        JSON.stringify(trace.metadata),
        trace.totalTokens?.input ?? null,
        trace.totalTokens?.output ?? null,
        trace.totalCostUsd?.input ?? null,
        trace.totalCostUsd?.output ?? null,
        bundle.spans.length,
        errorCount,
      );

      const insertSpan = this.db.prepare(`
        INSERT INTO spans (id, trace_id, parent_span_id, kind, name, status,
          provenance, started_at, ended_at, latency_ms, error, state_snapshot, payload, raw)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const span of bundle.spans) {
        insertSpan.run(
          span.id, span.traceId,
          span.parentSpanId ?? null,
          span.kind, span.name, span.status, span.provenance,
          span.startedAt, span.endedAt ?? null, span.latencyMs ?? null,
          span.error ? JSON.stringify(span.error) : null,
          span.stateSnapshot ? JSON.stringify(span.stateSnapshot) : null,
          JSON.stringify(span.payload),
          span.raw !== undefined ? JSON.stringify(span.raw) : null,
        );
      }

      const insertEdge = this.db.prepare(`
        INSERT INTO edges (id, trace_id, from_span_id, to_span_id, kind, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const edge of bundle.edges) {
        insertEdge.run(
          edge.id, edge.traceId,
          edge.fromSpanId, edge.toSpanId, edge.kind,
          edge.metadata ? JSON.stringify(edge.metadata) : null,
        );
      }

      if (bundle.rawSource !== undefined) {
        this.db.prepare(`
          INSERT OR REPLACE INTO raw_sources (trace_id, source) VALUES (?, ?)
        `).run(trace.id, JSON.stringify(bundle.rawSource));
      }
    });

    txn();
  }

  private loadTraceRecord(traceId: string): TraceRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM traces WHERE id = ?")
      .get(traceId) as TraceRow | undefined;
    return row ? rowToTraceRecord(row) : undefined;
  }

  private loadSpans(traceId: string): SpanRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM spans WHERE trace_id = ? ORDER BY started_at")
      .all(traceId) as SpanRow[];
    return rows.map(rowToSpanRecord);
  }

  private loadEdges(traceId: string): EdgeRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM edges WHERE trace_id = ?")
      .all(traceId) as EdgeRow[];
    return rows.map(rowToEdgeRecord);
  }

  private traceToSummary(trace: TraceRecord, spans: SpanRecord[]): TraceSummary {
    const errorCount = spans.filter((s) => s.error).length;
    return {
      id: trace.id,
      name: trace.name,
      framework: trace.framework,
      status: trace.status,
      startedAt: trace.startedAt,
      endedAt: trace.endedAt,
      durationMs:
        trace.endedAt !== undefined
          ? Math.max(trace.endedAt - trace.startedAt, 0)
          : undefined,
      updatedAt: trace.updatedAt,
      tags: trace.tags,
      totalTokens: trace.totalTokens,
      totalCostUsd: trace.totalCostUsd,
      spanCount: spans.length,
      errorCount,
    };
  }
}

// --- Row types ---

interface TraceRow {
  id: string;
  name: string;
  framework: string;
  status: string;
  started_at: number;
  ended_at: number | null;
  created_at: number;
  imported_at: number;
  updated_at: number;
  root_span_id: string;
  tags: string;
  metadata: string;
  total_tokens_input: number | null;
  total_tokens_output: number | null;
  total_cost_input: number | null;
  total_cost_output: number | null;
  span_count: number;
  error_count: number;
}

interface SpanRow {
  id: string;
  trace_id: string;
  parent_span_id: string | null;
  kind: string;
  name: string;
  status: string;
  provenance: string;
  started_at: number;
  ended_at: number | null;
  latency_ms: number | null;
  error: string | null;
  state_snapshot: string | null;
  payload: string;
  raw: string | null;
}

interface EdgeRow {
  id: string;
  trace_id: string;
  from_span_id: string;
  to_span_id: string;
  kind: string;
  metadata: string | null;
}

// --- Row mappers ---

function rowToTraceRecord(row: TraceRow): TraceRecord {
  const totalTokens: TokenUsage | undefined =
    row.total_tokens_input != null && row.total_tokens_output != null
      ? { input: row.total_tokens_input, output: row.total_tokens_output }
      : undefined;

  const totalCostUsd =
    row.total_cost_input != null && row.total_cost_output != null
      ? { input: row.total_cost_input, output: row.total_cost_output }
      : undefined;

  return {
    schemaVersion: 1,
    id: row.id,
    name: row.name,
    framework: row.framework as TraceRecord["framework"],
    status: row.status as TraceRecord["status"],
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    createdAt: row.created_at,
    importedAt: row.imported_at,
    updatedAt: row.updated_at,
    rootSpanId: row.root_span_id,
    tags: JSON.parse(row.tags),
    metadata: JSON.parse(row.metadata),
    totalTokens,
    totalCostUsd,
  };
}

function rowToSpanRecord(row: SpanRow): SpanRecord {
  return {
    id: row.id,
    traceId: row.trace_id,
    parentSpanId: row.parent_span_id ?? undefined,
    kind: row.kind as SpanRecord["kind"],
    name: row.name,
    status: row.status as SpanRecord["status"],
    provenance: row.provenance as SpanRecord["provenance"],
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    latencyMs: row.latency_ms ?? undefined,
    error: row.error ? JSON.parse(row.error) : undefined,
    stateSnapshot: row.state_snapshot ? JSON.parse(row.state_snapshot) : undefined,
    payload: JSON.parse(row.payload) as SpanPayload,
    raw: row.raw ? JSON.parse(row.raw) : undefined,
  };
}

function rowToEdgeRecord(row: EdgeRow): EdgeRecord {
  return {
    id: row.id,
    traceId: row.trace_id,
    fromSpanId: row.from_span_id,
    toSpanId: row.to_span_id,
    kind: row.kind as EdgeRecord["kind"],
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}

function rowToSummary(row: TraceRow): TraceSummary {
  const totalTokens: TokenUsage | undefined =
    row.total_tokens_input != null && row.total_tokens_output != null
      ? { input: row.total_tokens_input, output: row.total_tokens_output }
      : undefined;

  const totalCostUsd =
    row.total_cost_input != null && row.total_cost_output != null
      ? { input: row.total_cost_input, output: row.total_cost_output }
      : undefined;

  return {
    id: row.id,
    name: row.name,
    framework: row.framework as TraceSummary["framework"],
    status: row.status as TraceSummary["status"],
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    durationMs:
      row.ended_at != null
        ? Math.max(row.ended_at - row.started_at, 0)
        : undefined,
    updatedAt: row.updated_at,
    tags: JSON.parse(row.tags),
    totalTokens,
    totalCostUsd,
    spanCount: row.span_count,
    errorCount: row.error_count,
  };
}
