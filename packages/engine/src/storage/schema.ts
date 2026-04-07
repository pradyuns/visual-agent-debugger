import { integer, text, sqliteTable, real } from "drizzle-orm/sqlite-core";

export const traces = sqliteTable("traces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  framework: text("framework", { enum: ["agents-sdk", "raw"] }).notNull(),
  status: text("status", { enum: ["ok", "error", "running"] }).notNull(),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at"),
  createdAt: integer("created_at").notNull(),
  importedAt: integer("imported_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  rootSpanId: text("root_span_id").notNull(),
  tags: text("tags").notNull().default("[]"), // JSON array
  totalTokensInput: integer("total_tokens_input"),
  totalTokensOutput: integer("total_tokens_output"),
  totalCostUsdInput: real("total_cost_usd_input"),
  totalCostUsdOutput: real("total_cost_usd_output"),
  spanCount: integer("span_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
});

export const spans = sqliteTable("spans", {
  id: text("id").primaryKey(),
  traceId: text("trace_id")
    .notNull()
    .references(() => traces.id, { onDelete: "cascade" }),
  parentSpanId: text("parent_span_id"),
  kind: text("kind", {
    enum: [
      "root",
      "agent",
      "llm",
      "tool",
      "handoff",
      "retrieval",
      "guardrail",
      "custom",
    ],
  }).notNull(),
  name: text("name").notNull(),
  status: text("status", { enum: ["ok", "error", "running"] }).notNull(),
  provenance: text("provenance", {
    enum: ["recorded", "simulated", "live", "edited"],
  }).notNull(),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at"),
  latencyMs: real("latency_ms"),
  tokenInput: integer("token_input"),
  tokenOutput: integer("token_output"),
});

export const edges = sqliteTable("edges", {
  id: text("id").primaryKey(),
  traceId: text("trace_id")
    .notNull()
    .references(() => traces.id, { onDelete: "cascade" }),
  fromSpanId: text("from_span_id").notNull(),
  toSpanId: text("to_span_id").notNull(),
  kind: text("kind", {
    enum: ["handoff", "retry", "dependency", "correlation"],
  }).notNull(),
});
