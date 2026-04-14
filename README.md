# Agent Replay Debugger

Local-first debugger for inspecting, replaying, and comparing AI agent execution traces. Import traces from files, stream them live via an ingest API, then visualize execution as a directed graph with frame-by-frame replay and side-by-side comparison.

## Monorepo Structure

- `packages/engine` — canonical schema, Zod validation, format adapters, SQLite storage, and queries
- `apps/web` — Next.js dashboard with import flow, run viewer, and comparison UI
- `fixtures/traces` — sample raw and Agents SDK traces used in tests

## Getting Started

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`, import a JSON trace, and inspect it in the run viewer.

For a quick smoke test, import one of these fixtures from the dashboard:

- `fixtures/traces/raw/canonical-trace.json`
- `fixtures/traces/agents-sdk/simple-run.json`
- `fixtures/traces/agents-sdk/handoff-run.json`

## Features

### Dashboard

The main view lists all imported traces with filtering by framework (raw, Agents SDK), status (ok, running, error), and free-text search by name. Each row shows the run name, span count, error count, duration, total tokens, and start time. The dashboard auto-updates via SSE when new traces arrive or status changes.

### Run Viewer

Selecting a trace opens a graph view of the execution. Spans are rendered as an SVG directed graph with nodes color-coded by kind (agent, LLM, tool, handoff, guardrail, retrieval, custom). Parent-child edges are solid lines; handoff/retry/dependency edges are dashed. Clicking a node opens an inspector sidebar with four tabs: Overview, Payload, State, and Raw.

### Replay Mode

The run viewer includes a replay button that enables frame-by-frame playback through the span execution order. Transport controls provide step back/forward, play/pause, a timeline scrubber, and speed selection (0.5x–4x). Spans not yet reached are rendered as ghost nodes at reduced opacity.

### Live Streaming

Traces can be streamed in real time via the ingest API. The dashboard and run viewer subscribe to SSE endpoints that push new spans, status changes, and trace creation events. A "Go Live" button in replay mode jumps to the latest span.

### Trace Comparison

Select two traces from the dashboard to open a side-by-side diff view. The comparison shows unchanged, changed, added, and removed spans with latency and token deltas. Changed spans can be expanded to see field-level diffs.

## Ingest API

`POST /api/ingest` accepts JSON with spans, edges, and trace metadata. Authentication requires a bearer token set via `AGENT_DEBUGGER_INGEST_TOKEN`, or the request must come from loopback. Spans are upserted — new spans are added and existing spans are updated.

## Supported Formats

- **Canonical raw trace bundles** matching the engine schema
- **OpenAI Agents SDK traces** normalized through the built-in adapter

## Storage

Traces are stored in a SQLite database at `~/.agent-debugger/traces.db` (via `better-sqlite3`). Older file-backed traces are migrated automatically on first startup.

Set `AGENT_DEBUGGER_HOME` to override the default `~/.agent-debugger` directory.

## PII Redaction

Set `AGENT_DEBUGGER_REDACT` to enable automatic redaction of sensitive data at import time. The value is a comma-separated list of pattern names, or `all` to enable all built-in patterns.

```bash
AGENT_DEBUGGER_REDACT=all pnpm dev
```

Built-in patterns: `email`, `phone`, `api-key`, `ssn`, `credit-card`, `ipv4`.

## Verification

```bash
pnpm typecheck
pnpm test
pnpm build
```

Playwright e2e tests cover the import, viewer, delete, and missing-trace flows:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```
