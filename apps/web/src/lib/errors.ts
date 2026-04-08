import { ZodError } from "zod";
import { TraceImportError } from "@agent-debugger/engine";

export function isTraceNotFoundError(error: unknown) {
  return (
    error instanceof TraceImportError &&
    (error.code === "trace_not_found" || error.status === 404)
  );
}

export function toErrorResponse(error: unknown, fileName?: string) {
  if (error instanceof TraceImportError) {
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
