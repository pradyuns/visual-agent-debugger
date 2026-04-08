import { TraceImportError } from "@agent-debugger/engine";
import { isTraceNotFoundError, toErrorResponse } from "./errors";

describe("isTraceNotFoundError", () => {
  it("returns true for explicit trace-not-found errors", () => {
    expect(
      isTraceNotFoundError(
        new TraceImportError("trace_not_found", "missing", { status: 404 }),
      ),
    ).toBe(true);
  });

  it("returns false for other trace import failures", () => {
    expect(
      isTraceNotFoundError(
        new TraceImportError("invalid_raw_trace", "bad trace", { status: 400 }),
      ),
    ).toBe(false);
    expect(isTraceNotFoundError(new Error("boom"))).toBe(false);
  });
});

describe("toErrorResponse", () => {
  it("maps trace import errors onto stable JSON payloads", async () => {
    const response = toErrorResponse(
      new TraceImportError("invalid_json", "The uploaded file did not contain valid JSON.", {
        status: 400,
      }),
      "broken.json",
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_json",
      fileName: "broken.json",
    });
  });
});
