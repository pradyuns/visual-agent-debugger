import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export function openDatabase(dbPath: string): Db {
  const sqlite = new Database(dbPath);
  // Enable WAL mode for better concurrent read performance
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  // Create tables if they don't exist
  db.run(sql`
    CREATE TABLE IF NOT EXISTS traces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      framework TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      created_at INTEGER NOT NULL,
      imported_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      root_span_id TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      total_tokens_input INTEGER,
      total_tokens_output INTEGER,
      total_cost_usd_input REAL,
      total_cost_usd_output REAL,
      span_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS spans (
      id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
      parent_span_id TEXT,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      provenance TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      latency_ms REAL,
      token_input INTEGER,
      token_output INTEGER
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
      from_span_id TEXT NOT NULL,
      to_span_id TEXT NOT NULL,
      kind TEXT NOT NULL
    )
  `);

  // Indexes
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_spans_trace_id ON spans(trace_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_edges_trace_id ON edges(trace_id)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_traces_started_at ON traces(started_at)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_traces_status ON traces(status)`);
  db.run(sql`CREATE INDEX IF NOT EXISTS idx_traces_framework ON traces(framework)`);

  return db;
}
