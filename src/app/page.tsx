import { ResearchForm } from "@/components/research-form";

const PIPELINE = [
  { title: "Plan", body: "Interpret the question and break it into research subtopics." },
  { title: "Collect", body: "Query search, news and public data sources for each subtopic." },
  { title: "Clean", body: "Normalize, deduplicate and resolve companies to stable identities." },
  { title: "Analyze", body: "Filter for relevance, extract findings and identify trends." },
  { title: "Report", body: "Produce a report where every finding links to its sources." },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl">
      <section className="pt-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Market research, backed by sources
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-muted text-pretty">
          Ask a market research question. Get a structured report on the companies, recent
          developments and emerging trends, with every finding traceable to where it came from.
        </p>
      </section>

      <ResearchForm />

      <section className="mt-14">
        <h2 className="text-sm font-medium tracking-wide text-muted uppercase">How it works</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-5">
          {PIPELINE.map((step, i) => (
            <li key={step.title} className="rounded-lg border border-border bg-surface p-4">
              <p className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</p>
              <p className="mt-1 text-sm font-medium">{step.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
