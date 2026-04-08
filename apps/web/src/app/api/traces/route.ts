import { getTraceStore } from "../../../lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const framework = url.searchParams.get("framework") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const search = url.searchParams.get("search") ?? undefined;
  const tag = url.searchParams.get("tag") ?? undefined;

  const traces = await getTraceStore().listTraces({
    framework:
      framework === "raw" || framework === "agents-sdk" ? framework : undefined,
    status:
      status === "ok" || status === "error" || status === "running"
        ? status
        : undefined,
    search,
    tag,
  });

  return Response.json({ traces });
}
