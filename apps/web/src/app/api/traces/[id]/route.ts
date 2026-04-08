import { getTraceStore } from "../../../../lib/store";
import { toErrorResponse } from "../../../../lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const trace = await getTraceStore().getTrace(id);
    return Response.json({ trace });
  } catch (error) {
    return toErrorResponse(error);
  }
}
