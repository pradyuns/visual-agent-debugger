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
      text: async () => "{not-json",
    } as File;

    await expect(parseUploadedJsonFile(file)).rejects.toMatchObject({
      name: "TraceImportError",
      code: "invalid_json",
      status: 400,
    });
  });
});
