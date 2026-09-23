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

      <form className="mt-10 rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <div className="space-y-4">
          <div>
            <label htmlFor="query" className="block text-sm font-medium">
              Research question
            </label>
            <textarea
              id="query"
              name="query"
              rows={3}
              maxLength={500}
              placeholder="Cybersecurity startups in Europe"
              className="mt-1.5 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <div>
            <label htmlFor="focus" className="block text-sm font-medium">
              Focus <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="focus"
              name="focus"
              maxLength={500}
              placeholder="Companies, recent developments and emerging trends"
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">
            Research creation is not wired up yet. It is the next milestone.
          </p>
          <button
            type="submit"
            disabled
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start research
          </button>
        </div>
      </form>

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
