import { TraceImportError } from "./engine";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

export async function parseUploadedJsonFile(file: File) {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new TraceImportError(
      "file_too_large",
      `File exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB upload limit.`,
      { status: 413 },
    );
  }

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
