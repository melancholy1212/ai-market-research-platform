import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { EmptyState } from "@/components/empty-state";
import { ResearchCard } from "@/components/research-card";
import { SetupNotice } from "@/components/setup-notice";
import { MissingEnvError } from "@/lib/env";
import { listResearchSummaries, type ResearchSummary } from "@/lib/research";

export const metadata: Metadata = { title: "Research history" };

export default async function ResearchHistoryPage() {
  await connection();

  let researches: ResearchSummary[];
  try {
    researches = await listResearchSummaries();
  } catch (error) {
    if (error instanceof MissingEnvError) return <SetupNotice missing={error.missing} />;
    throw error;
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Research history</h1>
          <p className="mt-1 text-sm text-muted">Every research run, newest first.</p>
        </div>
        <Link href="/" className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-foreground hover:opacity-90">
          New research
        </Link>
      </div>

      <div className="mt-6">
        {researches.length === 0 ? (
          <EmptyState
            title="No research yet"
            description="Research runs you start will appear here with their status."
            action={
              <Link href="/" className="text-sm font-medium text-accent">
                Start the first one
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {researches.map((research) => (
              <ResearchCard key={research.id} research={research} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
