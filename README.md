# Agent Replay Debugger

Local-first viewer for imported agent traces. The monorepo contains:

- `packages/engine`: canonical schema, validation, adapters, storage, and queries.
- `apps/web`: Next.js dashboard, import flow, and single-run viewer.
- `fixtures/traces`: sample raw and Agents SDK traces used in tests.

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

## Data Directory

The app stores traces under `AGENT_DEBUGGER_HOME` when that environment variable is
set. Otherwise it defaults to `~/.agent-debugger`.

## Supported Formats

- Canonical raw trace bundles that match the engine schema
- Saved OpenAI Agents SDK trace fixtures normalized through the Agents SDK adapter

## Verification

```bash
pnpm typecheck
pnpm test
pnpm build
```

Playwright coverage is included for the import, viewer, delete, and missing-trace flows:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

## Current Scope

- Local-only trace import and storage
- Dashboard filtering by framework, status, and name
- Single-run graph view with typed inspector tabs
- Delete flow and missing-trace page

## Current Limitations

- The metadata index is file-backed for now; SQLite is deferred because the local Node environment did not support the planned native driver cleanly.
- Replay, compare, live streaming, and automatic redaction are not implemented in this MVP.
- The graph view is a custom SVG layout rather than React Flow to keep the build stable in this environment.
