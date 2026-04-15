import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  SqliteTraceStore,
  createTraceStore,
  type TraceBundle,
} from "./engine";

type Store = SqliteTraceStore | ReturnType<typeof createTraceStore>;

declare global {
  // eslint-disable-next-line no-var
  var __agentDebuggerStore: Store | undefined;
}

export function getTraceStore() {
  if (!globalThis.__agentDebuggerStore) {
    const dataDir =
      process.env.AGENT_DEBUGGER_HOME ??
      path.join(os.homedir(), ".agent-debugger");

    fs.mkdirSync(dataDir, { recursive: true });

    let store: Store;
    try {
      const dbPath = path.join(dataDir, "traces.db");
      store = new SqliteTraceStore({ dbPath });

      // Migrate from file-backed index if it exists
      const indexPath = path.join(dataDir, "index.json");
      if (fs.existsSync(indexPath)) {
        migrateFromFileStore(dataDir, store, indexPath);
      }
    } catch (err) {
      // better-sqlite3 native module may not load in all environments
      const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      console.warn(
        `SQLite unavailable, falling back to file-backed store (${reason})`,
      );
      if (err instanceof Error && err.stack) {
        console.warn(err.stack);
      }
      store = createTraceStore({ dataDir });
    }

    globalThis.__agentDebuggerStore = store;
  }

  return globalThis.__agentDebuggerStore;
}

function migrateFromFileStore(
  dataDir: string,
  store: SqliteTraceStore,
  indexPath: string,
) {
  try {
    const indexRaw = fs.readFileSync(indexPath, "utf8");
    const entries = JSON.parse(indexRaw) as Array<{ id: string }>;

    for (const entry of entries) {
      const bundlePath = path.join(dataDir, "traces", entry.id, "bundle.json");
      const rawPath = path.join(
        dataDir,
        "traces",
        entry.id,
        "raw",
        "source.json",
      );

      if (!fs.existsSync(bundlePath)) continue;

      try {
        const bundleRaw = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
        const rawSource = fs.existsSync(rawPath)
          ? JSON.parse(fs.readFileSync(rawPath, "utf8"))
          : undefined;

        const bundle = { ...bundleRaw, rawSource } as TraceBundle;

        store.importBundle(bundle);
      } catch (err) {
        const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        console.warn(
          `Skipping invalid migrated trace "${entry.id}" (${reason})`,
        );
      }
    }

    fs.renameSync(indexPath, `${indexPath}.migrated`);
  } catch (err) {
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.warn(
      `Failed to migrate traces from file-backed store (${reason}); continuing with SQLite only.`,
    );
  }
}
