import type { TokenUsage } from "@agent-debugger/engine";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatDate(timestamp: number) {
  return dateFormatter.format(timestamp);
}

export function formatDuration(durationMs?: number) {
  if (durationMs === undefined) {
    return "Running";
  }
  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }
  return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 0 : 1)} s`;
}

export function formatTokens(tokens?: TokenUsage) {
  if (!tokens) {
    return "n/a";
  }
  return `${tokens.input} in / ${tokens.output} out`;
}
