import os from "node:os";
import path from "node:path";

const SAFE_TRACE_ID = /^[A-Za-z0-9_-]+$/;

export function assertSafeTraceId(traceId: string): void {
  if (!SAFE_TRACE_ID.test(traceId)) {
    throw new Error(`Invalid trace ID: ${JSON.stringify(traceId)}`);
  }
}

export function resolveDataDir(customPath?: string) {
  return customPath ?? process.env.AGENT_DEBUGGER_HOME ?? path.join(os.homedir(), ".agent-debugger");
}

export function getTraceDir(dataDir: string, traceId: string) {
  assertSafeTraceId(traceId);
  return path.join(dataDir, "traces", traceId);
}

export function getTraceBundlePath(dataDir: string, traceId: string) {
  return path.join(getTraceDir(dataDir, traceId), "bundle.json");
}

export function getRawSourcePath(dataDir: string, traceId: string) {
  return path.join(getTraceDir(dataDir, traceId), "raw", "source.json");
}

export function getIndexPath(dataDir: string) {
  return path.join(dataDir, "index.json");
}
