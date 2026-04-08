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

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    await getTraceStore().deleteTrace(id);
    return Response.json({ deleted: true, traceId: id });
  } catch (error) {
    return toErrorResponse(error);
  }
}
