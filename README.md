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

## PII Redaction

Set `AGENT_DEBUGGER_REDACT` to enable automatic redaction of sensitive data at import
time. The value is a comma-separated list of pattern names, or `all` to enable all
built-in patterns.

```bash
AGENT_DEBUGGER_REDACT=all pnpm dev
```

Built-in patterns: `email`, `phone`, `api-key`, `ssn`, `credit-card`, `ipv4`.

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
