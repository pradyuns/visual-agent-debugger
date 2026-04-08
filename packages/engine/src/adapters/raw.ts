import type { TraceAdapter, TraceBundle } from "../types";
import { traceBundleSchema } from "../validation/schema";
import { TraceImportError } from "../validation/errors";

export class RawTraceAdapter implements TraceAdapter {
  readonly framework = "raw" as const;

  canParse(input: unknown): boolean {
    return traceBundleSchema.safeParse(input).success;
  }

  normalize(input: unknown): TraceBundle {
    const parsed = traceBundleSchema.safeParse(input);
    if (!parsed.success) {
      throw new TraceImportError("invalid_raw_trace", "Invalid canonical trace bundle.", {
        issues: parsed.error.issues,
      });
    }

    return {
      ...parsed.data,
      rawSource: parsed.data.rawSource ?? input,
    };
  }
}
