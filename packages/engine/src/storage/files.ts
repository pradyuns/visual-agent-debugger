import { promises as fs } from "node:fs";
import path from "node:path";
import type { TraceBundle } from "../types/index.js";

export function traceDir(dataDir: string, traceId: string): string {
  return path.join(dataDir, "traces", traceId);
}

export function bundlePath(dataDir: string, traceId: string): string {
  return path.join(traceDir(dataDir, traceId), "bundle.json");
}

export function rawSourcePath(dataDir: string, traceId: string): string {
  return path.join(traceDir(dataDir, traceId), "raw", "source.json");
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, filePath);
}

export async function writeBundle(
  dataDir: string,
  traceId: string,
  bundle: TraceBundle
): Promise<void> {
  const content = JSON.stringify(bundle, null, 2);
  await writeAtomic(bundlePath(dataDir, traceId), content);
}

export async function writeRawSource(
  dataDir: string,
  traceId: string,
  raw: unknown
): Promise<void> {
  const content = JSON.stringify(raw, null, 2);
  await writeAtomic(rawSourcePath(dataDir, traceId), content);
}

export async function readBundle(
  dataDir: string,
  traceId: string
): Promise<unknown> {
  const content = await fs.readFile(bundlePath(dataDir, traceId), "utf8");
  return JSON.parse(content) as unknown;
}

export async function deleteTraceFiles(
  dataDir: string,
  traceId: string
): Promise<void> {
  const dir = traceDir(dataDir, traceId);
  await fs.rm(dir, { recursive: true, force: true });
}

export async function listTraceIds(dataDir: string): Promise<string[]> {
  const tracesDir = path.join(dataDir, "traces");
  try {
    const entries = await fs.readdir(tracesDir);
    return entries;
  } catch {
    return [];
  }
}

export async function ensureDataDir(dataDir: string): Promise<void> {
  await fs.mkdir(path.join(dataDir, "traces"), { recursive: true });
}
