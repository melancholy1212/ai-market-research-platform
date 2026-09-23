import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { SetupNotice } from "@/components/setup-notice";
import { StatusBadge } from "@/components/status-badge";
import { MissingEnvError } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { getResearch, type Research } from "@/lib/research";
import type { ResearchStatus } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Research" };

// Report sections. They render as empty states until the pipeline that
// fills them exists; no placeholder data is shown.
const SECTIONS = [
  { title: "Overview", empty: "A summary of the topic, written from the collected sources." },
  { title: "Companies", empty: "Organizations identified during research, with country, focus and website." },
  { title: "Recent developments", empty: "Dated developments, each linked to the sources reporting it." },
  { title: "Emerging trends", empty: "Patterns that recur across multiple sources." },
  { title: "Sources", empty: "Every source consulted, with publisher, date and a link to the original." },
];

// What each non-terminal status means to the reader. Kept honest: until the
// research engine exists, nothing moves a research out of "pending".
const STATUS_NOTES: Partial<Record<ResearchStatus, string>> = {
  pending:
    "Queued. Automated processing is not enabled yet, so this research stays queued for now.",
  planning: "Breaking the question into research subtopics.",
  collecting: "Collecting sources.",
  processing: "Normalizing, deduplicating and resolving entities.",
  analyzing: "Analyzing findings and writing the report.",
};

export default async function ResearchDetailPage({ params }: PageProps<"/research/[id]">) {
  const { id } = await params;

  let research: Research | null;
  try {
    research = await getResearch(id);
  } catch (error) {
    if (error instanceof MissingEnvError) return <SetupNotice missing={error.missing} />;
    throw error;
  }
  if (!research) notFound();

  return (
    <div>
      <Link href="/research" className="text-sm text-muted hover:text-foreground">
        ← Research history
      </Link>

      <header className="mt-4 border-b border-border pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{research.query}</h1>
          <StatusBadge status={research.status} />
        </div>
        {research.focus && <p className="mt-1 text-muted">{research.focus}</p>}
        <p className="mt-2 text-xs text-muted">Created {formatDateTime(research.created_at)}</p>
        {STATUS_NOTES[research.status] && (
          <p className="mt-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
            {STATUS_NOTES[research.status]}
          </p>
        )}
        {research.status === "failed" && research.error_message && (
          <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
            {research.error_message}
          </p>
        )}
      </header>

      <div className="mt-8 space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="text-lg font-semibold tracking-tight">{section.title}</h2>
            <div className="mt-3">
              <EmptyState title="Nothing here yet" description={section.empty} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
