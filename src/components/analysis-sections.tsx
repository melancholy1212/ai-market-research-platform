import { formatDate } from "@/lib/format";
import { entityResolution, entitySourceIds, type Entity, type ResearchAnalysis } from "@/lib/research";

import { Citations, type CitationTarget } from "./citations";
import { CompaniesTable, type CompanyRow } from "./companies-table";

type Props = { analysis: ResearchAnalysis; citations: Map<string, CitationTarget> };

export function SectionHeading({ id, title, count, hint }: { id: string; title: string; count?: number; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 id={id} className="text-lg font-semibold tracking-tight">
        {title} {count !== undefined && <span className="font-normal text-muted tabular-nums">({count})</span>}
      </h2>
      {hint && <p className="hidden text-xs text-muted sm:block">{hint}</p>}
    </div>
  );
}

const Muted = ({ children }: { children: string }) => (
  <p className="mt-3 rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted">{children}</p>
);

export function OverviewSection({ analysis, citations }: Props) {
  const report = analysis.report!;
  const keyFindings = analysis.findings.filter((f) => f.type === "key_finding");
  return (
    <section>
      <SectionHeading id="overview" title="Overview" hint="Numbers link to the supporting sources" />
      <div className="mt-3 rounded-lg border border-border border-l-4 border-l-accent bg-surface p-5">
        <p className="leading-relaxed text-pretty">{report.overview}</p>
        {keyFindings.length > 0 && (
          <>
            <h3 className="mt-5 text-xs font-medium tracking-wide text-muted uppercase">Key findings</h3>
            <ol className="mt-2 space-y-2 text-sm">
              {keyFindings.map((f, i) => (
                <li key={f.id} className="flex gap-3">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent/10 font-mono text-[10px] font-semibold text-accent">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">
                    {f.title}
                    <Citations ids={f.sourceIds} index={citations} />
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}

const WEBSITE_SOURCE_LABEL = {
  sources: "Website from the collected sources",
  wikidata: "Website from Wikidata",
  clearbit: "Website from Clearbit (name match)",
  search: "Website from web search (name match)",
} as const;

function companyRow(entity: Entity, citations: Map<string, CitationTarget>): CompanyRow {
  const r = entityResolution(entity);
  const targets = [
    ...new Map(
      entitySourceIds(entity).flatMap((id) => (citations.has(id) ? [[citations.get(id)!.number, citations.get(id)!]] : [])),
    ).values(),
  ].sort((a, b) => a.number - b.number);

  let identity: CompanyRow["identity"] = { kind: null, href: null, title: "" };
  if (r?.status === "resolved" && r.wikidataId) {
    identity = {
      kind: "verified",
      href: `https://www.wikidata.org/wiki/${r.wikidataId}`,
      title: [
        `Matched to Wikidata ${r.wikidataId}${r.wikidataLabel ? ` (${r.wikidataLabel})` : ""}`,
        r.wikidataDescription,
        r.signals.length ? `Evidence: ${r.signals.join(", ")}` : null,
        r.confidence !== null ? `Confidence ${Math.round(r.confidence * 100)}%` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  } else if (r) {
    identity = {
      kind: r.status === "ambiguous" ? "ambiguous" : "unverified",
      href: null,
      title: r.status === "ambiguous" ? "Several organizations share this name; none was picked." : `Not verified: ${r.reason ?? "no confident match"}`,
    };
  }

  return {
    id: entity.id,
    name: entity.name,
    country: entity.country,
    focus: entity.description,
    domain: entity.domain,
    websiteLabel: r?.websiteSource ? WEBSITE_SOURCE_LABEL[r.websiteSource] : null,
    identity,
    citations: targets,
  };
}

export function CompaniesSection({ analysis, citations }: Props) {
  const { companies } = analysis;
  return (
    <section>
      <SectionHeading id="companies" title="Companies" count={companies.length} hint="Hover a badge for the matching evidence" />
      {companies.length === 0 ? (
        <Muted>No companies were identified in the sources.</Muted>
      ) : (
        <CompaniesTable rows={companies.map((c) => companyRow(c, citations))} />
      )}
    </section>
  );
}

export function DevelopmentsSection({ analysis, citations }: Props) {
  const developments = analysis.findings.filter((f) => f.type === "development");
  const companyName = new Map(analysis.companies.map((c) => [c.id, c.name]));
  return (
    <section>
      <SectionHeading id="developments" title="Recent developments" count={developments.length} hint="Newest first" />
      {developments.length === 0 ? (
        <Muted>No dated developments were found in the sources.</Muted>
      ) : (
        <ol className="relative mt-4 space-y-5 border-l border-border pl-6">
          {developments.map((f) => (
            <li key={f.id} className="relative">
              <span aria-hidden className="absolute top-1.5 -left-[29px] size-2.5 rounded-full border-2 border-surface bg-accent ring-1 ring-border" />
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                {f.occurred_at ? (
                  <time dateTime={f.occurred_at} className="font-medium text-foreground">
                    {formatDate(f.occurred_at)}
                  </time>
                ) : (
                  <span>Date unknown</span>
                )}
                {f.entity_id && companyName.has(f.entity_id) && (
                  <span className="rounded bg-surface-muted px-1.5 py-0.5 font-medium">{companyName.get(f.entity_id)}</span>
                )}
              </p>
              <p className="mt-1 font-medium">
                {f.title}
                <Citations ids={f.sourceIds} index={citations} />
              </p>
              {f.summary && <p className="mt-1 text-sm leading-relaxed text-muted">{f.summary}</p>}
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
      <SectionHeading id="trends" title="Emerging trends" count={trends.length} hint="Each backed by at least two sources" />
      {trends.length === 0 ? (
        <Muted>No trend was supported by more than one source.</Muted>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {trends.map((f) => (
            <div key={f.id} className="flex flex-col rounded-lg border border-border bg-surface p-4">
              <p className="font-medium">{f.title}</p>
              {f.summary && <p className="mt-1 flex-1 text-sm leading-relaxed text-muted">{f.summary}</p>}
              <p className="mt-3 flex items-center gap-1 text-xs text-muted">
                Supported by {f.sourceIds.length} sources
                <Citations ids={f.sourceIds} index={citations} />
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
