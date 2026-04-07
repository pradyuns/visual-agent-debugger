import type { TraceAdapter, TraceBundle } from "../types/index.js";
import { rawAdapter } from "./raw.js";
import { agentsSdkAdapter } from "./agents-sdk.js";

export { rawAdapter } from "./raw.js";
export { agentsSdkAdapter } from "./agents-sdk.js";
export { deriveLatencies, deriveTotals, ensureSingleRoot, createSyntheticRoot } from "./normalize.js";

const ADAPTERS: TraceAdapter[] = [rawAdapter, agentsSdkAdapter];

export class UnsupportedFormatError extends Error {
  constructor(message = "Unsupported trace format") {
    super(message);
    this.name = "UnsupportedFormatError";
  }
}

export function detectAndNormalize(input: unknown): TraceBundle {
  for (const adapter of ADAPTERS) {
    if (adapter.canParse(input)) {
      return adapter.normalize(input);
    }
  }
  throw new UnsupportedFormatError(
    "No adapter could parse the provided input. Supported formats: raw canonical bundle (schemaVersion: 1), OpenAI Agents SDK trace."
  );
}
