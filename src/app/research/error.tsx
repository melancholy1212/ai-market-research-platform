"use client";

export default function ResearchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-5 text-sm">
      <p className="font-medium">Something went wrong loading this page</p>
      <p className="mt-1 text-muted">
        The database request failed. This is usually temporary.
        {error.digest && <span className="font-mono"> (ref {error.digest})</span>}
      </p>
      <button
        onClick={reset}
        className="mt-4 rounded-lg border border-border bg-surface px-3 py-1.5 font-medium hover:bg-surface-muted"
      >
        Try again
      </button>
    </div>
  );
}
