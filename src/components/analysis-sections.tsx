import { formatDate } from "@/lib/format";
import { entityResolution, entitySourceIds, type Entity, type ResearchAnalysis } from "@/lib/research";

import { Citations, type CitationTarget } from "./citations";

type Props = { analysis: ResearchAnalysis; citations: Map<string, CitationTarget> };

function SectionTitle({ children, count }: { children: string; count?: number }) {
  return (
    <h2 className="text-lg font-semibold tracking-tight">
      {children} {count !== undefined && <span className="font-normal text-muted">({count})</span>}
    </h2>
  );
}

const Muted = ({ children }: { children: string }) => <p className="mt-3 text-sm text-muted">{children}</p>;

export function OverviewSection({ analysis, citations }: Props) {
  const report = analysis.report!;
  const keyFindings = analysis.findings.filter((f) => f.type === "key_finding");
  const meta = report.metadata as { provider?: string; model?: string } | null;
  return (
    <section>
      <SectionTitle>Overview</SectionTitle>
      <div className="mt-3 rounded-lg border border-border bg-surface p-5">
        <p className="text-sm leading-relaxed">{report.overview}</p>
        {keyFindings.length > 0 && (
          <>
            <h3 className="mt-5 text-xs font-medium tracking-wide text-muted uppercase">Key findings</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {keyFindings.map((f) => (
                <li key={f.id} className="flex gap-2">
                  <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted" />
                  <span>
                    {f.title}
                    <Citations ids={f.sourceIds} index={citations} />
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {meta?.model && (
          <p className="mt-5 text-xs text-muted">
            AI-generated from the sources below by {meta.model}. Numbers link to the supporting sources.
          </p>
        )}
      </div>
    </section>
  );
}

const WEBSITE_SOURCE_LABEL = {
  sources: "from the sources",
  wikidata: "from Wikidata",
  clearbit: "from Clearbit (name match)",
  search: "from web search (name match)",
} as const;

function IdentityBadge({ entity }: { entity: Entity }) {
  const r = entityResolution(entity);
  if (!r) return null;
  if (r.status === "resolved" && r.wikidataId) {
    const title = [
      `Matched to Wikidata ${r.wikidataId}${r.wikidataLabel ? ` (${r.wikidataLabel})` : ""}`,
      r.wikidataDescription,
      r.signals.length ? `Evidence: ${r.signals.join(", ")}` : null,
      r.confidence !== null ? `Confidence ${Math.round(r.confidence * 100)}%` : null,
    ]
      .filter(Boolean)
      .join("\n");
    return (
      <a
        href={`https://www.wikidata.org/wiki/${r.wikidataId}`}
        target="_blank"
        rel="noopener noreferrer"
        title={title}
        className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:underline dark:text-emerald-300"
      >
        Wikidata
      </a>
    );
  }
  return (
    <span
      title={r.status === "ambiguous" ? "Several organizations share this name; none was picked." : `Not verified: ${r.reason ?? "no confident match"}`}
      className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-muted"
    >
      {r.status === "ambiguous" ? "Ambiguous" : "Unverified"}
    </span>
  );
}

export function CompaniesSection({ analysis, citations }: Props) {
  const { companies } = analysis;
  return (
    <section>
      <SectionTitle count={companies.length}>Companies</SectionTitle>
      {companies.length === 0 ? (
        <Muted>No companies were identified in the sources.</Muted>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Company</th>
                <th className="px-4 py-2.5 font-medium">Country</th>
                <th className="px-4 py-2.5 font-medium">Focus</th>
                <th className="px-4 py-2.5 font-medium">Website</th>
                <th className="px-4 py-2.5 font-medium">Sources</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {companies.map((c) => {
                const websiteSource = entityResolution(c)?.websiteSource;
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{c.name}</span>
                        <IdentityBadge entity={c} />
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted">{c.country ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted">{c.description ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      {c.domain ? (
                        <a
                          href={`https://${c.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={websiteSource ? `Website ${WEBSITE_SOURCE_LABEL[websiteSource]}` : undefined}
                          className="text-accent hover:underline"
                        >
                          {c.domain}
                        </a>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Citations ids={entitySourceIds(c)} index={citations} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function DevelopmentsSection({ analysis, citations }: Props) {
  const developments = analysis.findings.filter((f) => f.type === "development");
  const companyName = new Map(analysis.companies.map((c) => [c.id, c.name]));
  return (
    <section>
      <SectionTitle count={developments.length}>Recent developments</SectionTitle>
      {developments.length === 0 ? (
        <Muted>No dated developments were found in the sources.</Muted>
      ) : (
        <ol className="mt-3 space-y-3">
          {developments.map((f) => (
            <li key={f.id} className="rounded-lg border border-border bg-surface px-4 py-3">
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                {f.occurred_at ? <time dateTime={f.occurred_at}>{formatDate(f.occurred_at)}</time> : <span>Date unknown</span>}
                {f.entity_id && companyName.has(f.entity_id) && (
                  <span className="rounded bg-surface-muted px-1.5 py-0.5 font-medium">{companyName.get(f.entity_id)}</span>
                )}
              </p>
              <p className="mt-1 text-sm font-medium">
                {f.title}
                <Citations ids={f.sourceIds} index={citations} />
              </p>
              {f.summary && <p className="mt-1 text-sm text-muted">{f.summary}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function TrendsSection({ analysis, citations }: Props) {
  const trends = analysis.findings.filter((f) => f.type === "trend");
  return (
    <section>
      <SectionTitle count={trends.length}>Emerging trends</SectionTitle>
      {trends.length === 0 ? (
        <Muted>No trend was supported by more than one source.</Muted>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {trends.map((f) => (
            <div key={f.id} className="rounded-lg border border-border bg-surface px-4 py-3">
              <p className="text-sm font-medium">
                {f.title}
                <Citations ids={f.sourceIds} index={citations} />
              </p>
              {f.summary && <p className="mt-1 text-sm text-muted">{f.summary}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
