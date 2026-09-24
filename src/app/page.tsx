import Link from "next/link";
import { connection } from "next/server";

import { ResearchCard } from "@/components/research-card";
import { ResearchForm } from "@/components/research-form";
import { listResearchSummaries, type ResearchSummary } from "@/lib/research";

// The research run executes in the background of the server action that
// this page's form calls, so it gets this route's time budget. 300s is the
// Vercel Hobby maximum; a run normally finishes in under a minute.
export const maxDuration = 300;

const EXAMPLES = ["Fintech startups in India", "AI startups in Germany", "Cybersecurity startups in Europe", "Robotics startups in Japan"];

const PIPELINE = [
  { title: "Collect", body: "Web search, news search and seven news sites' search feeds, with caching and per-source error handling." },
  { title: "Clean", body: "Normalize URLs and titles, drop block pages, and group the same story reported by different outlets." },
  {
    title: "Filter",
    body: "Classify each source as direct, contextual or irrelevant against the question's topic, geography and entity type; irrelevant ones are kept, not hidden.",
  },
  {
    title: "Analyze",
    body: "Direct and contextual sources are analyzed with AI to build the report, direct ones prioritized, with every claim cited and validated.",
  },
  {
    title: "Verify",
    body: "Confirm companies with several signals — official websites, independent coverage, entity matching — not Wikidata alone.",
  },
];

async function recentReports(): Promise<ResearchSummary[]> {
  try {
    return (await listResearchSummaries({ limit: 12, completedOnly: true })).filter((r) => r.overview).slice(0, 4);
  } catch {
    return []; // The landing page works without a database.
  }
}

export default async function Home() {
  await connection();
  const recent = await recentReports();

  return (
    <div className="mx-auto max-w-4xl">
      <section className="pt-4 text-center sm:pt-8">
        <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
          <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
          Every finding links to the sources it came from
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-5xl">Market research, backed by sources</h1>
        <p className="mx-auto mt-4 max-w-2xl text-muted text-pretty sm:text-lg">
          Ask a question about a market. Get a structured report on the companies, recent developments and emerging trends,
          built from real web and news sources and verified where it can be.
        </p>
      </section>

      <div className="mx-auto max-w-3xl">
        <ResearchForm examples={EXAMPLES} />
      </div>

      {recent.length > 0 && (
        <section className="mt-14">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-sm font-medium tracking-wide text-muted uppercase">Recent reports</h2>
            <Link href="/research" className="text-sm text-accent hover:underline">
              All research →
            </Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {recent.map((r) => (
              <ResearchCard key={r.id} research={r} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-14">
        <h2 className="text-sm font-medium tracking-wide text-muted uppercase">How it works</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {PIPELINE.map((step, i) => (
            <li key={step.title} className="rounded-lg border border-border bg-surface p-4">
              <p className="font-mono text-xs text-accent">{String(i + 1).padStart(2, "0")}</p>
              <p className="mt-1 text-sm font-medium">{step.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
