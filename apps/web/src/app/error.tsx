"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center px-6 py-16">
      <div className="max-w-lg rounded-[28px] border border-white/10 bg-ink/75 p-8 text-center shadow-panel backdrop-blur">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Runtime Error
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-smoke">
          Something went wrong.
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-300">
          The page hit an unexpected error. You can retry the current view or
          return to the dashboard.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex rounded-full border border-tide/50 bg-tide px-5 py-3 text-sm font-medium text-ink transition hover:scale-[1.01]"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex rounded-full border border-white/20 bg-white/5 px-5 py-3 text-sm font-medium text-smoke transition hover:bg-white/10"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
