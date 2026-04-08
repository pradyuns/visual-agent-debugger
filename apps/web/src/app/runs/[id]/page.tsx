import { notFound } from "next/navigation";
import { RunViewer } from "../../../components/run-viewer";
import { isTraceNotFoundError } from "../../../lib/errors";
import { getTraceStore } from "../../../lib/store";

export const dynamic = "force-dynamic";

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const bundle = await getTraceStore().getTrace(id);
    return <RunViewer bundle={bundle} />;
  } catch (error) {
    if (isTraceNotFoundError(error)) {
      notFound();
    }

    throw error;
  }
}
