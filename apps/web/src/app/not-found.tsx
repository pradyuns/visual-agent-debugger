import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center px-6 py-16">
      <div className="max-w-lg rounded-[28px] border border-white/10 bg-ink/75 p-8 text-center shadow-panel backdrop-blur">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Trace Missing
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-smoke">
          This run is no longer available.
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-300">
          The trace may have been deleted from local storage or the URL may no
          longer point at a valid run.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex rounded-full border border-tide/50 bg-tide px-5 py-3 text-sm font-medium text-ink transition hover:scale-[1.01]"
        >
          Return to dashboard
        </Link>
      </div>
    </main>
  );
}
