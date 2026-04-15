import { ZodError } from "zod";
import { TraceImportError } from "./engine";

/**
 * Duck-typed detector for TraceImportError.
 *
 * Next.js bundles route handlers and transpiled workspace packages in separate
 * module graphs, so an error thrown from inside @agent-debugger/engine can be
 * an instance of a different `TraceImportError` class than the one imported
 * here. That makes `error instanceof TraceImportError` unreliable in practice
 * (it returns false for genuine trace-import errors), which is why not-found
 * responses were surfacing as HTTP 500 instead of 404. We match by class name
 * and the shape of the extra properties set in the constructor.
 */
function isTraceImportError(error: unknown): error is TraceImportError {
  if (error instanceof TraceImportError) return true;
  if (!(error instanceof Error)) return false;
  if (error.name !== "TraceImportError") return false;
  const candidate = error as Error & { code?: unknown; status?: unknown };
  return typeof candidate.code === "string" && typeof candidate.status === "number";
}

export function isTraceNotFoundError(error: unknown) {
  return (
    isTraceImportError(error) &&
    (error.code === "trace_not_found" || error.status === 404)
  );
}

export function toErrorResponse(error: unknown, fileName?: string) {
  if (isTraceImportError(error)) {
    return Response.json(
      {
        error: error.code,
        message: error.message,
        fileName,
        issues: error.issues,
      },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    const zodError = error;
    return Response.json(
      {
        error: "validation_error",
        message: "The trace payload did not match the expected schema.",
        fileName,
        issues: zodError.issues,
      },
      { status: 400 },
    );
  }

  return Response.json(
    {
      error: "internal_error",
      message: error instanceof Error ? error.message : "Unknown import failure.",
      fileName,
    },
    { status: 500 },
  );
}
