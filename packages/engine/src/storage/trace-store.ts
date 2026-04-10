import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { TraceAdapter, TraceBundle, TraceListFilters, TraceStore, TraceSummary } from "../types";
import { defaultAdapters } from "../adapters";
import { buildTraceGraphData } from "../queries/derived";
import { normalizeTraceBundle } from "../validation/normalize";
import { rawBundleFileSchema, traceSummaryListSchema } from "../validation/schema";
import { TraceImportError } from "../validation/errors";
import { getIndexPath, getRawSourcePath, getTraceBundlePath, getTraceDir, resolveDataDir } from "./paths";

interface LocalTraceStoreOptions {
  adapters?: TraceAdapter[];
  dataDir?: string;
}

export class LocalTraceStore implements TraceStore {
  private readonly adapters: TraceAdapter[];
  private readonly dataDir: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: LocalTraceStoreOptions = {}) {
    this.adapters = options.adapters ?? defaultAdapters;
    this.dataDir = resolveDataDir(options.dataDir);
  }

  async importTrace(input: unknown, sourceName: string) {
    const adapter = this.adapters.find((candidate) => candidate.canParse(input));
    if (!adapter) {
      throw new TraceImportError(
        "unsupported_format",
        `Unsupported trace format for "${sourceName}".`,
      );
    }

    const normalized = normalizeTraceBundle(adapter.normalize(input), {
      rawSource: input,
    });

    return this.enqueueWrite(async () => {
      await this.writeTraceFiles(normalized);
      await this.indexBundle(normalized);

      return { traceId: normalized.trace.id };
    });
  }

  async listTraces(filters: TraceListFilters = {}) {
    const rows = await this.readIndex();

    return rows
      .filter((row) => (filters.framework ? row.framework === filters.framework : true))
      .filter((row) => (filters.status ? row.status === filters.status : true))
      .filter((row) => (filters.tag ? row.tags.includes(filters.tag) : true))
      .filter((row) =>
        filters.search
          ? row.name.toLowerCase().includes(filters.search.toLowerCase())
          : true,
      )
      .sort((left, right) => right.startedAt - left.startedAt);
  }

  async getTrace(traceId: string) {
    const bundlePath = getTraceBundlePath(this.dataDir, traceId);
    const rawPath = getRawSourcePath(this.dataDir, traceId);
    const bundleContents = await fs.readFile(bundlePath, "utf8").catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new TraceImportError(
          "trace_not_found",
          `Trace "${traceId}" was not found.`,
          { status: 404, cause: error },
        );
      }
      throw error;
    });
    const [bundleRaw, rawSourceRaw] = await Promise.all([
      Promise.resolve(bundleContents),
      fs.readFile(rawPath, "utf8").catch(() => undefined),
    ]);

    const bundle = rawBundleFileSchema.parse(JSON.parse(bundleRaw));
    const rawSource = rawSourceRaw ? JSON.parse(rawSourceRaw) : undefined;

    return {
      ...bundle,
      rawSource,
      graph: buildTraceGraphData(bundle),
    } as TraceBundle & { graph: ReturnType<typeof buildTraceGraphData> };
  }

  async deleteTrace(traceId: string) {
    await this.enqueueWrite(async () => {
      await fs.access(getTraceBundlePath(this.dataDir, traceId)).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          throw new TraceImportError(
            "trace_not_found",
            `Trace "${traceId}" was not found.`,
            { status: 404, cause: error },
          );
        }
        throw error;
      });
      await fs.rm(getTraceDir(this.dataDir, traceId), { recursive: true, force: true });
      const index = await this.readIndex();
      await this.writeIndex(index.filter((trace) => trace.id !== traceId));
    });
  }

  async rebuildIndex() {
    await this.enqueueWrite(async () => {
      await this.writeIndex(await this.collectTraceSummaries());
    });
  }

  private async writeTraceFiles(bundle: TraceBundle) {
    const traceDir = getTraceDir(this.dataDir, bundle.trace.id);
    const bundlePath = getTraceBundlePath(this.dataDir, bundle.trace.id);
    const rawPath = getRawSourcePath(this.dataDir, bundle.trace.id);
    const tracePayload = JSON.stringify(
      {
        trace: bundle.trace,
        spans: bundle.spans,
        edges: bundle.edges,
      },
      null,
      2,
    );

    await fs.mkdir(path.dirname(bundlePath), { recursive: true });
    await fs.mkdir(path.dirname(rawPath), { recursive: true });

    await writeJsonAtomic(bundlePath, tracePayload);
    await writeJsonAtomic(rawPath, JSON.stringify(bundle.rawSource ?? null, null, 2));
    await fs.mkdir(traceDir, { recursive: true });
  }

  private async indexBundle(bundle: TraceBundle) {
    const index = await this.readIndex();
    const next = index.filter((trace) => trace.id !== bundle.trace.id);
    next.push(summarizeBundle(bundle));
    await this.writeIndex(next);
  }

  private async readIndex() {
    const indexPath = getIndexPath(this.dataDir);
    const raw = await fs.readFile(indexPath, "utf8").catch(() => "[]");
    try {
      return traceSummaryListSchema.parse(JSON.parse(raw));
    } catch {
      const rebuilt = await this.collectTraceSummaries();
      await this.writeIndex(rebuilt);
      return rebuilt;
    }
  }

  private async writeIndex(index: TraceSummary[]) {
    await fs.mkdir(this.dataDir, { recursive: true });
    await writeJsonAtomic(getIndexPath(this.dataDir), JSON.stringify(index, null, 2));
  }

  private async enqueueWrite<T>(operation: () => Promise<T>) {
    const pending = this.writeQueue.then(operation, operation);
    this.writeQueue = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }

  private async collectTraceSummaries() {
    const tracesRoot = path.join(this.dataDir, "traces");
    const dirs = await fs.readdir(tracesRoot, { withFileTypes: true }).catch(() => []);
    const summaries: TraceSummary[] = [];

    for (const entry of dirs) {
      if (!entry.isDirectory()) {
        continue;
      }

      try {
        const bundleRaw = await fs.readFile(
          getTraceBundlePath(this.dataDir, entry.name),
          "utf8",
        );
        const bundle = rawBundleFileSchema.parse(JSON.parse(bundleRaw));
        summaries.push(summarizeBundle(bundle));
      } catch {
        continue;
      }
    }

    return summaries;
  }
}

async function writeJsonAtomic(filePath: string, contents: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, contents, "utf8");
  try {
    await fs.rename(tempPath, filePath);
  } finally {
    await fs.unlink(tempPath).catch(() => {});
  }
}

function summarizeBundle(bundle: TraceBundle): TraceSummary {
  const errorCount = bundle.spans.filter((span) => span.error).length;
  return {
    id: bundle.trace.id,
    name: bundle.trace.name,
    framework: bundle.trace.framework,
    status: bundle.trace.status,
    startedAt: bundle.trace.startedAt,
    endedAt: bundle.trace.endedAt,
    durationMs:
      bundle.trace.endedAt !== undefined
        ? Math.max(bundle.trace.endedAt - bundle.trace.startedAt, 0)
        : undefined,
    updatedAt: bundle.trace.updatedAt,
    tags: bundle.trace.tags,
    totalTokens: bundle.trace.totalTokens,
    totalCostUsd: bundle.trace.totalCostUsd,
    spanCount: bundle.spans.length,
    errorCount,
  };
}

export function createTraceStore(options: LocalTraceStoreOptions = {}) {
  return new LocalTraceStore(options);
}
