import "server-only";

import type { Analysis } from "@/lib/pipeline/analysis";

import { cachedCompanyWebsite, findCompanyWebsite, isCoolingDown, SearchBlockedError } from "./ddg";
import { registrableDomain } from "./domain";
import { resolveCompany, type Resolution } from "./resolve";
import { getEntities, getLabels, searchOrganizations } from "./wikidata";

type ExtractedCompany = Analysis["companies"][number];

export type WebsiteSource = "sources" | "wikidata" | "search";

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
  };
};

export type ResolutionStats = {
  resolved: number;
  ambiguous: number;
  unresolved: number;
  merged: number;
  websites: Record<WebsiteSource, number>;
  searchLookups: number;
  searchBlocked: boolean;
  wikidataErrors: number;
};

// Lookups against DuckDuckGo per research; the rest of the budget is caching.
const MAX_SEARCH_LOOKUPS = 3;
const WIKIDATA_CONCURRENCY = 3;

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

export async function resolveCompanies(companies: ExtractedCompany[], context: string) {
  const stats: ResolutionStats = {
    resolved: 0,
    ambiguous: 0,
    unresolved: 0,
    merged: 0,
    websites: { sources: 0, wikidata: 0, search: 0 },
    searchLookups: 0,
    searchBlocked: false,
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

    return {
      ...company,
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
      },
    };
  });

  // 2. Websites still missing. Stored answers first (free, and they must
  //    not use up the live budget), then a few live DuckDuckGo lookups for
  //    the most-cited remaining companies.
  const hint = (c: ResolvedCompany) => `${c.country ?? ""} company`;
  const setWebsite = (c: ResolvedCompany, domain: string | null) => {
    if (domain) {
      c.domain = domain;
      c.websiteSource = "search";
    }
  };
  const missing = resolved.filter((c) => !c.domain);
  const uncached: ResolvedCompany[] = [];
  await Promise.all(
    missing.map(async (c) => {
      const cached = await cachedCompanyWebsite(c.name, hint(c)).catch(() => undefined);
      if (cached === undefined) uncached.push(c);
      else setWebsite(c, cached);
    }),
  );
  uncached.sort((a, b) => b.sourceIds.length - a.sourceIds.length || resolved.indexOf(a) - resolved.indexOf(b));

  if (uncached.length && (await isCoolingDown().catch(() => false))) stats.searchBlocked = true;
  for (const company of uncached) {
    if (stats.searchBlocked || stats.searchLookups >= MAX_SEARCH_LOOKUPS) break;
    try {
      const { domain, fromCache } = await findCompanyWebsite(company.name, hint(company));
      if (!fromCache) stats.searchLookups++;
      setWebsite(company, domain);
    } catch (error) {
      if (error instanceof SearchBlockedError) stats.searchBlocked = true;
      else console.warn(`website search failed for ${company.name}`, error);
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

  // Counts describe the final, merged companies.
  for (const c of merged) {
    stats[c.resolution.status]++;
    if (c.websiteSource) stats.websites[c.websiteSource]++;
  }
  return { companies: merged, stats };
}
