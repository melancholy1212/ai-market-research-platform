import "server-only";

import { ProviderError } from "@/lib/http";
import type { Analysis } from "@/lib/pipeline/analysis";

import { assessVerification, reconcileEntityType, type Verification } from "./assess";
import { clearbitDomain } from "./clearbit";
import { registrableDomain } from "./domain";
import { resolveCompany, type Resolution } from "./resolve";
import { cachedTavilyWebsite, findWebsiteWithTavily, tavilyWebsiteConfigured } from "./tavily-website";
import { getEntities, getLabels, searchOrganizations } from "./wikidata";

type ExtractedCompany = Analysis["companies"][number];

export type WebsiteSource = "sources" | "wikidata" | "clearbit" | "search";

export type ResolvedCompany = ExtractedCompany & {
  // Names merged into this company (same Wikidata item or same domain).
  names: string[];
  websiteSource: WebsiteSource | null;
  resolution: {
    status: Resolution["status"];
    wikidataId: string | null;
    wikidataLabel: string | null;
    wikidataDescription: string | null;
    confidence: number | null;
    signals: string[];
    reason: string | null;
    wikidataCountry: string | null;
  };
  // Where the entity type came from when Wikidata overruled the sources.
  typeEvidence: string | null;
  verification: Verification;
};

export type ResolutionStats = {
  resolved: number;
  ambiguous: number;
  unresolved: number;
  merged: number;
  websites: Record<WebsiteSource, number>;
  // Paid (Tavily) web-search lookups made for this research.
  searchLookups: number;
  searchUnavailable: boolean;
  clearbitErrors: number;
  // Website lookups skipped because the time budget ran out.
  skippedForTime: number;
  wikidataErrors: number;
};

// Paid web-search lookups per research; everything else is free or cached.
const MAX_SEARCH_LOOKUPS = 3;
// Resolution must leave the run comfortably inside Vercel's 300s limit.
// Past this budget, remaining website lookups are skipped (and counted).
const TIME_BUDGET_MS = 90_000;
const WIKIDATA_CONCURRENCY = 3;

export function verifyCompany(c: ResolvedCompany, sourceUrls: ReadonlyMap<string, string[]>): Verification {
  return assessVerification({
    wikidataMatch: c.resolution.status === "resolved",
    websiteSource: c.domain ? c.websiteSource : null,
    citedSourceUrls: c.sourceIds.flatMap((id) => sourceUrls.get(id) ?? []),
    country: c.country,
    wikidataCountry: c.resolution.wikidataCountry,
    domain: c.domain,
  });
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

// `sourceUrls` maps each cited source id to the URLs of every outlet that
// reported that story, for judging coverage in verification confidence.
export async function resolveCompanies(
  companies: ExtractedCompany[],
  context: string,
  sourceUrls: ReadonlyMap<string, string[]> = new Map(),
  timeBudgetMs = TIME_BUDGET_MS,
) {
  const deadline = Date.now() + timeBudgetMs;
  const outOfTime = () => Date.now() > deadline;
  const stats: ResolutionStats = {
    resolved: 0,
    ambiguous: 0,
    unresolved: 0,
    merged: 0,
    websites: { sources: 0, wikidata: 0, clearbit: 0, search: 0 },
    searchLookups: 0,
    searchUnavailable: false,
    clearbitErrors: 0,
    skippedForTime: 0,
    wikidataErrors: 0,
  };

  // 1. Wikidata candidates: one search per company, then one batch for all
  //    candidates and one for their countries.
  const candidateIds = await mapPool(companies, WIKIDATA_CONCURRENCY, (c) =>
    searchOrganizations(c.name).catch(() => {
      stats.wikidataErrors++;
      return [] as string[];
    }),
  );
  const entities = await getEntities(candidateIds.flat()).catch(() => {
    stats.wikidataErrors++;
    return [];
  });
  const byId = new Map(entities.map((e) => [e.id, e]));
  const countryLabels = await getLabels(entities.flatMap((e) => e.countryIds)).catch(() => new Map<string, string>());

  const resolved: ResolvedCompany[] = companies.map((company, i) => {
    const candidates = candidateIds[i].map((id) => byId.get(id)).filter((e) => e !== undefined);
    const r = resolveCompany(company, candidates, countryLabels, context);

    const match = r.status === "resolved" ? r.match : null;
    const wikidataCountry =
      match?.matchedCountry ?? match?.entity.countryIds.map((id) => countryLabels.get(id)).find(Boolean) ?? null;
    const wikidataDomain = match?.entity.websites.map(registrableDomain).find(Boolean) ?? null;
    const domain = company.domain ?? wikidataDomain;
    const type = reconcileEntityType(
      company.entityType,
      company.typeEvidence,
      match ? { inceptionYear: match.entity.inceptionYear, instanceOf: match.entity.instanceOf } : null,
    );

    return {
      ...company,
      entityType: type.type,
      typeEvidence: type.evidence,
      // Filled in once websites and merges are settled.
      verification: { confidence: "low" as const, signals: [] },
      // Structured data wins over text extraction when the match is confident.
      country: wikidataCountry ?? company.country,
      domain,
      names: [company.name],
      websiteSource: company.domain ? "sources" : wikidataDomain ? "wikidata" : null,
      resolution: {
        status: r.status,
        wikidataId: match?.entity.id ?? null,
        wikidataLabel: match?.entity.label ?? null,
        wikidataDescription: match?.entity.description ?? null,
        confidence: r.status === "resolved" ? r.confidence : null,
        signals: match?.signals ?? [],
        reason: r.status === "unresolved" ? r.reason : r.status === "ambiguous" ? "several candidates fit equally well" : null,
        wikidataCountry,
      },
    };
  });

  // 2. Websites still missing, cheapest first:
  //    a. Clearbit name-to-domain (free, cached), for every such company;
  //    b. Tavily web search (1 credit, cached) for the most-cited companies
  //       still missing one, at most MAX_SEARCH_LOOKUPS live lookups.
  const setWebsite = (c: ResolvedCompany, domain: string | null, source: WebsiteSource) => {
    if (domain) {
      c.domain = domain;
      c.websiteSource = source;
    }
  };
  await mapPool(
    resolved.filter((c) => !c.domain),
    4,
    async (c) => {
      if (outOfTime()) {
        stats.skippedForTime++;
        return;
      }
      try {
        setWebsite(c, await clearbitDomain(c.name, c.country), "clearbit");
      } catch (error) {
        stats.clearbitErrors++;
        console.warn(`Clearbit lookup failed for ${c.name}`, error);
      }
    },
  );

  const stillMissing = resolved
    .filter((c) => !c.domain)
    .sort((a, b) => b.sourceIds.length - a.sourceIds.length || resolved.indexOf(a) - resolved.indexOf(b));
  const hint = (c: ResolvedCompany) => `${c.country ?? ""} company`;
  // Cached answers are free and must not use up the live budget.
  const uncached: ResolvedCompany[] = [];
  await Promise.all(
    stillMissing.map(async (c) => {
      const cached = await cachedTavilyWebsite(c.name, hint(c)).catch(() => undefined);
      if (cached === undefined) uncached.push(c);
      else setWebsite(c, cached, "search");
    }),
  );
  uncached.sort((a, b) => stillMissing.indexOf(a) - stillMissing.indexOf(b));
  if (!tavilyWebsiteConfigured()) stats.searchUnavailable = uncached.length > 0;
  for (const company of uncached) {
    if (stats.searchUnavailable || stats.searchLookups >= MAX_SEARCH_LOOKUPS) break;
    if (outOfTime()) {
      stats.skippedForTime += uncached.length - uncached.indexOf(company);
      break;
    }
    try {
      const { domain, fromCache } = await findWebsiteWithTavily(company.name, hint(company));
      if (!fromCache) stats.searchLookups++;
      setWebsite(company, domain, "search");
    } catch (error) {
      if (error instanceof ProviderError && error.kind !== "network" && error.kind !== "timeout") stats.searchUnavailable = true;
      console.warn(`Tavily website lookup failed for ${company.name}`, error);
    }
  }

  // 3. Merge companies that are the same organization.
  const merged: ResolvedCompany[] = [];
  for (const company of resolved) {
    const same = merged.find(
      (m) =>
        (company.resolution.wikidataId && m.resolution.wikidataId === company.resolution.wikidataId) ||
        (company.domain && m.domain === company.domain),
    );
    if (!same) {
      merged.push(company);
      continue;
    }
    stats.merged++;
    same.names.push(company.name);
    same.sourceIds = [...new Set([...same.sourceIds, ...company.sourceIds])];
    same.country ??= company.country;
    same.focus ??= company.focus;
  }

  // 4. Verification confidence from every signal gathered above.
  for (const c of merged) c.verification = verifyCompany(c, sourceUrls);

  // Counts describe the final, merged companies.
  for (const c of merged) {
    stats[c.resolution.status]++;
    if (c.websiteSource) stats.websites[c.websiteSource]++;
  }
  return { companies: merged, stats };
}
