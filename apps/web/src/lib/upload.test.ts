import { parseUploadedJsonFile } from "./upload";

describe("parseUploadedJsonFile", () => {
  it("parses valid JSON upload bodies", async () => {
    const file = {
      text: async () => JSON.stringify({ trace: "ok" }),
    } as File;

    await expect(parseUploadedJsonFile(file)).resolves.toMatchObject({
      trace: "ok",
    });
  });

  it("throws a typed 400 error for malformed JSON", async () => {
    const file = {
      size: 9,
      text: async () => "{not-json",
    } as File;

    await expect(parseUploadedJsonFile(file)).rejects.toMatchObject({
      name: "TraceImportError",
      code: "invalid_json",
      status: 400,
    });
  });

  it("rejects oversized upload bodies before reading them into memory", async () => {
    const file = {
      size: 50 * 1024 * 1024 + 1,
      text: async () => {
        throw new Error("should not be read");
      },
    } as unknown as File;

    await expect(parseUploadedJsonFile(file)).rejects.toMatchObject({
      name: "TraceImportError",
      code: "file_too_large",
      status: 413,
    });
  });
});
