import type { ZodIssue } from "zod";

export class TraceImportError extends Error {
  readonly code: string;
  readonly issues?: ZodIssue[];
  readonly status: number;

  constructor(
    code: string,
    message: string,
    options?: { issues?: ZodIssue[]; status?: number; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "TraceImportError";
    this.code = code;
    this.issues = options?.issues;
    this.status = options?.status ?? 400;
  }
}
