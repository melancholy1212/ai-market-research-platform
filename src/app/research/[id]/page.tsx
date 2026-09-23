import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  CompaniesSection,
  DevelopmentsSection,
  OverviewSection,
  SectionHeading,
  TrendsSection,
} from "@/components/analysis-sections";
import { AutoRefresh } from "@/components/auto-refresh";
import type { CitationTarget } from "@/components/citations";
import { EmptyState } from "@/components/empty-state";
import { PipelineProgress } from "@/components/pipeline-progress";
import { ProgressLog } from "@/components/progress-log";
import { ResearchFunnel, type FunnelStep } from "@/components/research-funnel";
import { SetupNotice } from "@/components/setup-notice";
import { Bone } from "@/components/skeleton";
import { groupSourcesByStory, SetAsideSources, sourceAnchor, SourceList, type Story } from "@/components/source-list";
import { StatusBadge } from "@/components/status-badge";
import { MissingEnvError } from "@/lib/env";
import { formatDateTime, formatDuration } from "@/lib/format";
import {
  entityResolution,
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

export async function generateMetadata({ params }: PageProps<"/research/[id]">): Promise<Metadata> {
  const { id } = await params;
  try {
    const research = await getResearch(id);
    return { title: research?.query ?? "Research" };
  } catch {
    return { title: "Research" };
  }
}

const STATUS_NOTES: Partial<Record<ResearchStatus, string>> = {
  pending: "Queued. The run starts in a moment.",
  planning: "Planning searches for the question.",
  collecting: "Searching news and web sources.",
  processing: "Cleaning up sources, grouping duplicate stories and filtering off-topic ones.",
  analyzing: "Analyzing the sources with AI. This usually takes under a minute.",
  resolving: "Verifying companies against Wikidata and finding their websites.",
};

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

// Raw search results before merging, from the processing log entry.
function resultsCollected(events: ResearchEvent[], fallback: number): number {
  for (const e of events) {
    const received = (e.metadata as { received?: unknown } | null)?.received;
    if (e.stage === "processing" && typeof received === "number") return received;
  }
  return fallback;
}

type ReportMeta = { provider?: string; model?: string; input_tokens?: number | null; output_tokens?: number | null; sources_analyzed?: number };

function Sidebar({
  research,
  analysis,
  sections,
}: {
  research: Research;
  analysis: ResearchAnalysis | null;
  sections: { id: string; title: string; count?: number }[];
}) {
  const meta = (analysis?.report?.metadata ?? {}) as ReportMeta;
  const details: [string, string][] = [
    ["Created", formatDateTime(research.created_at)],
    ...(research.completed_at
      ? [["Duration", formatDuration(Date.parse(research.completed_at) - Date.parse(research.created_at))] as [string, string]]
      : []),
    ...(meta.model ? [["Model", meta.model] as [string, string]] : []),
    ...(meta.sources_analyzed ? [["Sources analyzed", String(meta.sources_analyzed)] as [string, string]] : []),
    ...(meta.input_tokens
      ? [["Tokens", `${meta.input_tokens.toLocaleString("en")} in · ${(meta.output_tokens ?? 0).toLocaleString("en")} out`] as [string, string]]
      : []),
  ];
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-20 space-y-6">
        <nav aria-label="On this page">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">On this page</p>
          <ul className="mt-2 space-y-1 border-l border-border text-sm">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="-ml-px flex justify-between border-l border-transparent py-0.5 pl-3 text-muted hover:border-accent hover:text-foreground">
                  {s.title}
                  {s.count !== undefined && <span className="tabular-nums">{s.count}</span>}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Run details</p>
          <dl className="mt-2 space-y-1.5 text-sm">
            {details.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </aside>
  );
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

  const allStories = groupSourcesByStory(sources);
  // Unscored sources (older research) count as relevant.
  const stories = allStories.filter((s) => s.primary.is_relevant !== false);
  const setAside = allStories.filter((s) => s.primary.is_relevant === false);
  const relevantSourceCount = stories.reduce((n, s) => n + 1 + s.alsoReported.length, 0);
  const aiOffTopic = new Set(
    ((analysis?.report?.metadata as { ai_off_topic_source_ids?: unknown } | null)?.ai_off_topic_source_ids as string[] | undefined) ?? [],
  );
  const citations = citationIndex(stories);
  const analysisFailed = events.some((e) => e.stage === "analyzing" && e.level === "warning");
  const hasReport = Boolean(analysis?.report);

  const findings = analysis?.findings ?? [];
  const companies = analysis?.companies ?? [];
  const verified = companies.filter((c) => entityResolution(c)?.status === "resolved").length;
  const funnel: FunnelStep[] = [
    { label: "Results collected", value: resultsCollected(events, sources.length), hint: "Search and news results before any cleanup" },
    { label: "Unique stories", value: allStories.length, hint: "After removing repeated URLs and grouping the same story from different outlets" },
    { label: "On topic", value: stories.length, hint: "Stories kept by relevance filtering and sent to the AI" },
    { label: "Companies", value: companies.length, hint: "Organizations the analysis identified in the sources" },
    { label: "Verified", value: verified, hint: "Companies matched to a Wikidata record with supporting evidence" },
  ];
  const sections = [
    ...(hasReport
      ? [
          { id: "overview", title: "Overview" },
          { id: "companies", title: "Companies", count: companies.length },
          { id: "developments", title: "Developments", count: findings.filter((f) => f.type === "development").length },
          { id: "trends", title: "Trends", count: findings.filter((f) => f.type === "trend").length },
        ]
      : []),
    { id: "sources", title: "Sources", count: stories.length || undefined },
  ];

  return (
    <div>
      <AutoRefresh active={running} />

      <Link href="/research" className="text-sm text-muted hover:text-foreground">
        ← Research history
      </Link>

      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{research.query}</h1>
          <StatusBadge status={stale ? "failed" : research.status} />
        </div>
        {research.focus && <p className="mt-1 text-muted">{research.focus}</p>}
        <p className="mt-2 text-xs text-muted lg:hidden">Created {formatDateTime(research.created_at)}</p>

        <div className="mt-5">
          {running ? (
            <div className="rounded-lg border border-border bg-surface p-4">
              <PipelineProgress status={research.status} />
              {note && (
                <p className="mt-3 flex items-center gap-2 text-sm text-muted">
                  <span aria-hidden className="size-2 animate-pulse rounded-full bg-accent" />
                  {note}
                </p>
              )}
            </div>
          ) : (
            // Without a report, company counts would read as "found none".
            research.status === "completed" && <ResearchFunnel steps={hasReport ? funnel : funnel.slice(0, 3)} />
          )}
        </div>

        {stale && (
          <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">This run stopped before it finished.</p>
        )}
        {research.status === "failed" && research.error_message && (
          <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">{research.error_message}</p>
        )}
      </header>

      <div className="mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-10">
        <div className="min-w-0 space-y-10">
          {hasReport && analysis ? (
            <>
              <OverviewSection analysis={analysis} citations={citations} />
              <CompaniesSection analysis={analysis} citations={citations} />
              <DevelopmentsSection analysis={analysis} citations={citations} />
              <TrendsSection analysis={analysis} citations={citations} />
            </>
          ) : running ? (
            <section aria-label="Report" className="rounded-lg border border-border bg-surface p-5">
              <p className="text-sm font-medium">The report appears here when the analysis finishes</p>
              <p className="mt-1 text-sm text-muted">Overview, companies, recent developments and emerging trends, each linked to its sources.</p>
              <div className="mt-4 space-y-2" aria-hidden>
                <Bone className="h-4 w-full" />
                <Bone className="h-4 w-11/12" />
                <Bone className="h-4 w-4/5" />
              </div>
            </section>
          ) : (
            <EmptyState
              title={analysisFailed ? "Analysis unavailable" : "Not analyzed"}
              description={
                analysisFailed
                  ? "The AI analysis could not be completed for this research; the run log explains why. The sources below are real."
                  : "This research was collected before AI analysis was enabled. The sources below are real."
              }
            />
          )}

          <section>
            <SectionHeading
              id="sources"
              title="Sources"
              count={relevantSourceCount || undefined}
              hint={stories.length < relevantSourceCount ? `${stories.length} stories; duplicates grouped` : undefined}
            />
            <div className="mt-3">
              {stories.length > 0 ? (
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
              <SetAsideSources stories={setAside} aiOffTopic={aiOffTopic} />
            </div>
          </section>

          {events.length > 0 && (
            <details open={running} className="rounded-lg border border-border bg-surface px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium select-none">
                Run log <span className="font-normal text-muted">({events.length} steps)</span>
              </summary>
              <div className="mt-3">
                <ProgressLog events={events} />
              </div>
            </details>
          )}
        </div>

        <Sidebar research={research} analysis={analysis} sections={sections} />
      </div>
    </div>
  );
}
