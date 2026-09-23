import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  CompaniesSection,
  DevelopmentsSection,
  OverviewSection,
  TrendsSection,
} from "@/components/analysis-sections";
import { AutoRefresh } from "@/components/auto-refresh";
import type { CitationTarget } from "@/components/citations";
import { EmptyState } from "@/components/empty-state";
import { ProgressLog } from "@/components/progress-log";
import { SetupNotice } from "@/components/setup-notice";
import { groupSourcesByStory, sourceAnchor, SourceList, type Story } from "@/components/source-list";
import { StatusBadge } from "@/components/status-badge";
import { MissingEnvError } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import {
  getAnalysis,
  getResearch,
  isStale,
  listEvents,
  listSources,
  type Research,
  type ResearchAnalysis,
  type ResearchEvent,
  type Source,
} from "@/lib/research";
import type { ResearchStatus } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Research" };

const STATUS_NOTES: Partial<Record<ResearchStatus, string>> = {
  pending: "Queued. The run starts in a moment.",
  planning: "Planning searches for the question.",
  collecting: "Searching news and web sources.",
  processing: "Cleaning up sources and grouping duplicate stories.",
  analyzing: "Analyzing the sources with AI. This usually takes under a minute.",
};

// Placeholders shown until a research has an analysis; never fake data.
const ANALYSIS_SECTIONS = [
  { title: "Overview", empty: "A summary of the topic, written from the collected sources." },
  { title: "Companies", empty: "Organizations identified during research, with country, focus and website." },
  { title: "Recent developments", empty: "Dated developments, each linked to the sources reporting it." },
  { title: "Emerging trends", empty: "Patterns that recur across multiple sources." },
];

// Citation number for every source id: stories are numbered in list order,
// and duplicates share their story's number.
function citationIndex(stories: Story[]): Map<string, CitationTarget> {
  const index = new Map<string, CitationTarget>();
  stories.forEach(({ primary, alsoReported }, i) => {
    const target = {
      number: i + 1,
      anchor: sourceAnchor(primary.id),
      label: [primary.title, primary.publisher].filter(Boolean).join(" — "),
    };
    for (const s of [primary, ...alsoReported]) index.set(s.id, target);
  });
  return index;
}

export default async function ResearchDetailPage({ params }: PageProps<"/research/[id]">) {
  const { id } = await params;

  let research: Research | null;
  let sources: Source[] = [];
  let events: ResearchEvent[] = [];
  let analysis: ResearchAnalysis | null = null;
  try {
    research = await getResearch(id);
    if (research) {
      [sources, events, analysis] = await Promise.all([listSources(id), listEvents(id), getAnalysis(id)]);
    }
  } catch (error) {
    if (error instanceof MissingEnvError) return <SetupNotice missing={error.missing} />;
    throw error;
  }
  if (!research) notFound();

  const stale = isStale(research);
  const terminal = research.status === "completed" || research.status === "failed";
  const running = !terminal && !stale;
  const note = running ? STATUS_NOTES[research.status] : undefined;
  const stories = groupSourcesByStory(sources);
  const citations = citationIndex(stories);
  const analysisFailed = events.some((e) => e.stage === "analyzing" && e.level === "warning");

  return (
    <div>
      <AutoRefresh active={running} />

      <Link href="/research" className="text-sm text-muted hover:text-foreground">
        ← Research history
      </Link>

      <header className="mt-4 border-b border-border pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{research.query}</h1>
          <StatusBadge status={stale ? "failed" : research.status} />
        </div>
        {research.focus && <p className="mt-1 text-muted">{research.focus}</p>}
        <p className="mt-2 text-xs text-muted">Created {formatDateTime(research.created_at)}</p>

        {note && (
          <p className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
            <span aria-hidden className="size-2 animate-pulse rounded-full bg-accent" />
            {note}
          </p>
        )}
        {stale && (
          <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
            This run stopped before it finished.
          </p>
        )}
        {research.status === "failed" && research.error_message && (
          <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
            {research.error_message}
          </p>
        )}
      </header>

      {events.length > 0 && (
        <details open={running} className="group mt-6 rounded-lg border border-border bg-surface px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium select-none">
            Run log <span className="font-normal text-muted">({events.length} steps)</span>
          </summary>
          <div className="mt-3">
            <ProgressLog events={events} />
          </div>
        </details>
      )}

      <div className="mt-8 space-y-8">
        {analysis?.report ? (
          <>
            <OverviewSection analysis={analysis} citations={citations} />
            <CompaniesSection analysis={analysis} citations={citations} />
            <DevelopmentsSection analysis={analysis} citations={citations} />
            <TrendsSection analysis={analysis} citations={citations} />
          </>
        ) : (
          ANALYSIS_SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold tracking-tight">{section.title}</h2>
              <div className="mt-3">
                <EmptyState
                  title={running ? "Nothing here yet" : analysisFailed ? "Analysis unavailable" : "Not analyzed"}
                  description={
                    running
                      ? section.empty
                      : analysisFailed
                        ? "The AI analysis could not be completed for this research; the run log explains why. The sources below are real."
                        : "This research was collected before AI analysis was enabled. The sources below are real."
                  }
                />
              </div>
            </section>
          ))
        )}

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Sources{" "}
            {sources.length > 0 && (
              <span className="font-normal text-muted">
                ({sources.length}
                {stories.length < sources.length && ` sources, ${stories.length} stories`})
              </span>
            )}
          </h2>
          <div className="mt-3">
            {sources.length > 0 ? (
              <SourceList stories={stories} />
            ) : (
              <EmptyState
                title={running ? "Collecting sources…" : "No sources"}
                description={
                  running
                    ? "Sources appear here as soon as they are collected."
                    : "Every source consulted, with publisher, date and a link to the original."
                }
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
