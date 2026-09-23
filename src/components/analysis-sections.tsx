import { ENTITY_TYPE_LABEL, ENTITY_TYPES, rankCompanies, type EntityType } from "@/lib/entities/assess";
import { formatDate } from "@/lib/format";
import {
  entityResolution,
  entitySourceIds,
  entityTypeEvidence,
  entityVerification,
  type Entity,
  type ResearchAnalysis,
  type ResearchConstraints,
} from "@/lib/research";

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

const asEntityType = (t: string): EntityType | null => (ENTITY_TYPES.includes(t as EntityType) ? (t as EntityType) : null);

function companyRow(entity: Entity, citations: Map<string, CitationTarget>): CompanyRow {
  const r = entityResolution(entity);
  const v = entityVerification(entity);
  const type = asEntityType(entity.entity_type);
  const targets = [
    ...new Map(
      entitySourceIds(entity).flatMap((id) => (citations.has(id) ? [[citations.get(id)!.number, citations.get(id)!]] : [])),
    ).values(),
  ].sort((a, b) => a.number - b.number);
  const wikidata = r?.status === "resolved" && r.wikidataId ? r : null;

  return {
    id: entity.id,
    name: entity.name,
    typeLabel: type && type !== "other" ? ENTITY_TYPE_LABEL[type] : null,
    typeEvidence: entityTypeEvidence(entity),
    country: entity.country,
    focus: entity.description,
    domain: entity.domain,
    websiteLabel: r?.websiteSource ? WEBSITE_SOURCE_LABEL[r.websiteSource] : null,
    confidence: v?.confidence ?? null,
    evidence: [
      v?.signals.length ? `Evidence: ${v.signals.join("; ")}` : null,
      wikidata ? `Wikidata ${wikidata.wikidataId}${wikidata.wikidataLabel ? ` (${wikidata.wikidataLabel})` : ""}: ${wikidata.wikidataDescription ?? ""}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    wikidataHref: wikidata ? `https://www.wikidata.org/wiki/${wikidata.wikidataId}` : null,
    citations: targets,
  };
}

const PLURAL_TYPE: Record<string, string> = {
  startup: "Startups",
  established_company: "Established companies",
  investor: "Investors",
  research_institution: "Research institutions",
};

// Companies ordered for the question: requested entity type, geography,
// topic, then evidence. When the question asks for a kind of organization
// (e.g. startups), those lead and everything else is listed as ecosystem.
export function CompaniesSection({ analysis, citations, constraints }: Props & { constraints: ResearchConstraints | null }) {
  const ranked = rankCompanies(
    analysis.companies.map((c) => ({
      entity: c,
      name: c.name,
      entityType: asEntityType(c.entity_type),
      country: c.country,
      focus: c.description,
      confidence: entityVerification(c)?.confidence ?? null,
      citationCount: entitySourceIds(c).length,
    })),
    constraints,
  );
  // Entities saved before classification have no type; don't split those.
  const classified = ranked.some((c) => c.entityType !== null);
  const wanted = classified && constraints?.entityType && constraints.entityType !== "any" ? constraints.entityType : null;
  const primary = wanted ? ranked.filter((c) => c.entityType === wanted) : ranked;
  const ecosystem = wanted ? ranked.filter((c) => c.entityType !== wanted) : [];
  const title = wanted && primary.length > 0 ? (PLURAL_TYPE[wanted] ?? "Companies") : "Companies";

  return (
    <section>
      <SectionHeading id="companies" title={title} count={primary.length || analysis.companies.length} hint="Hover a badge for the evidence" />
      {analysis.companies.length === 0 ? (
        <Muted>No companies were identified in the sources.</Muted>
      ) : primary.length === 0 ? (
        <>
          <p className="mt-2 text-sm text-muted">No {title.toLowerCase()} were identified; these organizations appear in the sources.</p>
          <CompaniesTable rows={ecosystem.map((c) => companyRow(c.entity, citations))} />
        </>
      ) : (
        <>
          <CompaniesTable rows={primary.map((c) => companyRow(c.entity, citations))} />
          {ecosystem.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium">
                Other organizations in the ecosystem <span className="font-normal text-muted">({ecosystem.length})</span>
              </h3>
              <p className="mt-0.5 text-xs text-muted">Relevant to the question but not {title.toLowerCase()}: established companies, investors, partners.</p>
              <CompaniesTable rows={ecosystem.map((c) => companyRow(c.entity, citations))} />
            </div>
          )}
        </>
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
