import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NativeAgentsSdkTraceAdapter } from "../adapters/agents-sdk-native";
import { normalizeTraceBundle } from "../validation/normalize";

// Synthetic examples following TraceImpl.export / SpanImpl.export in the Python SDK.
const trace = { object: "trace", id: "trace_1", workflow_name: "Support", group_id: null, metadata: null };
const span = (id: string, parent_id: string | null, span_data: Record<string, unknown>) => ({
  object: "trace.span", id, trace_id: "trace_1", parent_id,
  started_at: "2025-01-02T03:04:05.000Z", ended_at: "2025-01-02T03:04:06.250Z",
  span_data, error: null,
});
const agent = span("a", null, { type: "agent", name: "Triage", handoffs: ["Billing"], tools: null, output_type: null });
const generation = span("g", "a", { type: "generation", model: "model-1", input: [{ role: "user", content: "Hello" }], output: [{ content: "Hi" }], usage: { input_tokens: 12, output_tokens: 4 } });
const fn = span("f", "a", { type: "function", name: "lookup", input: "query", output: "answer", mcp_data: null });
const handoff = span("h", "a", { type: "handoff", from_agent: "Triage", to_agent: "Billing" });
const adapter = new NativeAgentsSdkTraceAdapter();

describe("native Agents SDK export", () => {
  it("imports records produced by Python Agents SDK 0.23.1", () => {
    // Captured from locally constructed spans using SDK export(); no model call was made.
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../fixtures/traces/agents-sdk/python-sdk-0.23.1-export.json");
    const input = JSON.parse(fs.readFileSync(file, "utf8"));
    const result = normalizeTraceBundle(adapter.normalize(input), { traceId: "stored" });
    expect(result.trace).toMatchObject({ name: "SDK fixture", metadata: { environment: "test", group_id: "group_fixture" }, status: "error", totalTokens: { input: 12, output: 4 } });
    expect(result.spans).toHaveLength(4);
    expect(result.spans.find((s) => s.id === "span_generation")).toMatchObject({ parentSpanId: "span_agent", payload: { kind: "llm", request: { model: "example-model" }, usage: { input: 12, output: 4 } } });
    expect(result.spans.find((s) => s.id === "span_function")).toMatchObject({ status: "error", payload: { kind: "tool", input: "question", output: "answer" } });
    expect(result.spans.find((s) => s.id === "span_handoff")?.payload).toEqual({ kind: "handoff", fromAgent: "Triage", toAgent: "Billing" });
  });
  it("maps trace metadata, parent links, timings, generation, function, handoff and errors", () => {
    const failed = { ...fn, error: { message: "failed", data: { detail: "example" } } };
    const input = { data: [trace, agent, generation, failed, handoff] };
    expect(adapter.canParse(input)).toBe(true);
    const result = normalizeTraceBundle(adapter.normalize(input), { traceId: "stored" });
    expect(result.trace).toMatchObject({ name: "Support", framework: "agents-sdk", status: "error", totalTokens: { input: 12, output: 4 } });
    expect(result.trace.startedAt).toBe(Date.parse("2025-01-02T03:04:05Z"));
    expect(result.spans.find((s) => s.id === "g")).toMatchObject({ parentSpanId: "a", latencyMs: 1250, payload: { kind: "llm", request: { model: "model-1", messages: [{ role: "user", content: "Hello" }] }, usage: { input: 12, output: 4 } } });
    expect(result.spans.find((s) => s.id === "f")).toMatchObject({ status: "error", error: { message: "failed" }, payload: { kind: "tool", tool: { name: "lookup" }, input: "query", output: "answer" }, raw: failed });
    expect(result.spans.find((s) => s.id === "h")?.payload).toEqual({ kind: "handoff", fromAgent: "Triage", toAgent: "Billing" });
    expect(result.edges).toEqual([]); // SDK handoff data does not identify a target span.
  });
  it.each(["2025-02-30T00:00:00Z", "2023-02-29T10:00:00+05:30", "2025-04-31T00:00:00Z", "2025-01-01T24:00:00Z", "2025-01-01T12:00:00+24:00"]) (
    "rejects impossible calendar values: %s", (value) => {
      expect(() => normalizeTraceBundle(adapter.normalize({ data: [trace, { ...agent, started_at: value }] }))).toThrow(/invalid calendar timestamp/i);
    },
  );
  it.each([
    ["2024-02-29T23:59:59+05:30", "2024-03-01T00:00:01+05:30", "2024-02-29T18:29:59Z"],
    ["2000-02-29T00:00:00-08:00", "2000-02-29T00:00:01-08:00", "2000-02-29T08:00:00Z"],
  ])("accepts valid leap days and timezone offsets", (start, end, expected) => {
    const result = normalizeTraceBundle(adapter.normalize({ data: [trace, { ...agent, started_at: start, ended_at: end }] }));
    expect(result.spans[0]!.startedAt).toBe(Date.parse(expected));
  });
  it("preserves unknown SDK span data without inventing semantics", () => {
    const item = span("x", null, { type: "response", response_id: "r1" });
    expect(adapter.normalize({ data: [trace, item] }).spans[0]).toMatchObject({ kind: "custom", raw: item });
  });
  it.each([
    [{ data: [agent] }, "exactly one trace"],
    [{ data: [trace] }, "at least one completed span"],
    [{ data: [trace, { ...trace, id: "trace_2" }, agent] }, "exactly one trace"],
    [{ data: [trace, { ...agent, trace_id: "trace_2" }] }, "another trace"],
    [{ data: [trace, { ...agent, parent_id: "missing" }] }, "missing parent"],
    [{ data: [trace, agent, agent] }, "duplicate span"],
    [{ data: [trace, { ...agent, ended_at: null }] }, "incomplete"],
    [{ data: [trace, { ...agent, started_at: "2025-01-02" }] }, "ISO 8601"],
    [{ data: [trace, { ...agent, ended_at: "2025-01-01T00:00:00Z" }] }, "ends before"],
  ])("rejects incomplete or inconsistent exports", (input, message) => {
    expect(adapter.canParse(input)).toBe(true);
    expect(() => adapter.normalize(input)).toThrow(message as string);
  });
  it("retains cycle validation in the import pipeline", () => {
    const input = { data: [trace, { ...agent, parent_id: "g" }, generation] };
    expect(() => normalizeTraceBundle(adapter.normalize(input))).toThrow(/cycle/i);
  });
});
