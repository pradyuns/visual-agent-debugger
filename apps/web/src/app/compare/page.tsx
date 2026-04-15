import Link from "next/link";
import { getTraceStore } from "../../lib/store";
import { compareTraces } from "../../lib/engine";
import { TraceComparisonView } from "../../components/trace-comparison";

export const dynamic = "force-dynamic";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ left?: string; right?: string }>;
}) {
  const { left, right } = await searchParams;

  if (!left || !right) {
    return (
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center gap-6 px-6 py-8">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-3xl font-semibold text-smoke">Compare Traces</h1>
          <p className="text-sm leading-6 text-slate-300">
            Select two traces from the dashboard to compare them side by side.
          </p>
          <Link
            href="/"
            className="inline-block rounded-[24px] border border-tide/60 bg-tide/20 px-6 py-3 text-sm font-medium text-tide transition hover:bg-tide/30"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const store = getTraceStore();

  try {
    const [leftBundle, rightBundle] = await Promise.all([
      store.getTrace(left),
      store.getTrace(right),
    ]);

    const comparison = compareTraces(leftBundle, rightBundle);
    return <TraceComparisonView comparison={comparison} />;
  } catch {
    return (
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center gap-6 px-6 py-8">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-3xl font-semibold text-smoke">Trace Not Found</h1>
          <p className="text-sm text-slate-300">
            One or both of the selected traces could not be loaded.
          </p>
          <Link
            href="/"
            className="inline-block rounded-[24px] border border-tide/60 bg-tide/20 px-6 py-3 text-sm font-medium text-tide transition hover:bg-tide/30"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }
}
