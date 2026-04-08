import { createTraceStore } from "@agent-debugger/engine";

declare global {
  // eslint-disable-next-line no-var
  var __agentDebuggerStore: ReturnType<typeof createTraceStore> | undefined;
}

export function getTraceStore() {
  if (!globalThis.__agentDebuggerStore) {
    globalThis.__agentDebuggerStore = createTraceStore();
  }

  return globalThis.__agentDebuggerStore;
}
