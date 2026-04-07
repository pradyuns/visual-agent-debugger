import type { TraceAdapter, TraceBundle } from "../types/index.js";
import { validateBundle, detectCycles, validateEdgeRefs } from "../validation/index.js";
import { deriveLatencies, deriveTotals } from "./normalize.js";

export const rawAdapter: TraceAdapter = {
  framework: "raw",

  canParse(input: unknown): boolean {
    if (typeof input !== "object" || input === null) return false;
    const obj = input as Record<string, unknown>;
    return (
      "trace" in obj &&
      "spans" in obj &&
      "edges" in obj &&
      typeof obj["trace"] === "object" &&
      obj["trace"] !== null &&
      (obj["trace"] as Record<string, unknown>)["schemaVersion"] === 1
    );
  },

  normalize(input: unknown): TraceBundle {
    const bundle = validateBundle(input);
    detectCycles(bundle.spans);
    validateEdgeRefs(bundle.spans, bundle.edges);
    const spans = deriveLatencies(bundle.spans);
    const trace = deriveTotals(bundle.trace, spans);
    return { ...bundle, trace, spans };
  },
};
