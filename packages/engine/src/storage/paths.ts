import os from "node:os";
import path from "node:path";

export function resolveDataDir(customPath?: string) {
  return customPath ?? process.env.AGENT_DEBUGGER_HOME ?? path.join(os.homedir(), ".agent-debugger");
}

export function getTraceDir(dataDir: string, traceId: string) {
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
