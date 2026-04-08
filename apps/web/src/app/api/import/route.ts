import { getTraceStore } from "../../../lib/store";
import { toErrorResponse } from "../../../lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json(
      {
        error: "missing_file",
        message: "Attach a single JSON trace file in the `file` field.",
      },
      { status: 400 },
    );
  }

  try {
    const contents = JSON.parse(await file.text());
    const result = await getTraceStore().importTrace(contents, file.name);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, file.name);
  }
}
