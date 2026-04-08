import { TraceImportError } from "@agent-debugger/engine";

export async function parseUploadedJsonFile(file: File) {
  const raw = await file.text();

  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new TraceImportError(
      "invalid_json",
      "The uploaded file did not contain valid JSON.",
      { status: 400, cause: error },
    );
  }
}
