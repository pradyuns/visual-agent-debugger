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

## Data Directory

The app stores traces under `AGENT_DEBUGGER_HOME` when that environment variable is
set. Otherwise it defaults to `~/.agent-debugger`.

## Supported Formats

- Canonical raw trace bundles that match the engine schema
- Saved OpenAI Agents SDK trace fixtures normalized through the Agents SDK adapter
