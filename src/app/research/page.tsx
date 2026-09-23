import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { EmptyState } from "@/components/empty-state";
import { SetupNotice } from "@/components/setup-notice";
import { StatusBadge } from "@/components/status-badge";
import { MissingEnvError } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { isStale, listResearches, type Research } from "@/lib/research";

export const metadata: Metadata = { title: "Research history" };

export default async function ResearchHistoryPage() {
  await connection();

  let researches: Research[];
  try {
    researches = await listResearches();
  } catch (error) {
    if (error instanceof MissingEnvError) return <SetupNotice missing={error.missing} />;
    throw error;
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Research history</h1>
          <p className="mt-1 text-sm text-muted">Every research run, newest first.</p>
        </div>
        <Link
          href="/"
          className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-foreground"
        >
          New research
        </Link>
      </div>

      <div className="mt-6">
        {researches.length === 0 ? (
          <EmptyState
            title="No research yet"
            description="Research runs you start will appear here with their status."
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {researches.map((research) => (
              <li key={research.id}>
                <Link
                  href={`/research/${research.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-surface-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{research.query}</p>
                    {research.focus && (
                      <p className="truncate text-xs text-muted">{research.focus}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span className="hidden text-xs text-muted sm:inline">
                      {formatDateTime(research.created_at)}
                    </span>
                    <StatusBadge status={isStale(research) ? "failed" : research.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
