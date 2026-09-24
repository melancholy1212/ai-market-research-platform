import "server-only";

import { requestJson } from "@/lib/http";
import { withCache } from "@/lib/providers/cache";
import type { Json } from "@/lib/supabase/database.types";

import { parseWikidataEntities, type WikidataEntity } from "./resolve";

const API = "https://www.wikidata.org/w/api.php";
const TTL_SECONDS = 30 * 24 * 60 * 60; // entity data changes slowly
const BATCH = 50; // wbgetentities maximum

// Full-text search restricted to organization classes. Plain name search
// (wbsearchentities) ranks "credit card" above the company CRED.
const ORG_FILTER =
  "haswbstatement:P31=Q4830453|P31=Q783794|P31=Q6881511|P31=Q891723|P31=Q1589009|P31=Q18388277|P31=Q1058914|P31=Q43229|P31=Q22687|P31=Q650241";

const get = (params: Record<string, string>) =>
  requestJson(`${API}?${new URLSearchParams({ ...params, format: "json" })}`, {
    provider: "wikidata",
    timeoutMs: 15_000,
    retries: 1,
  }) as Promise<Json>;

const isQid = (t: unknown): t is string => typeof t === "string" && /^Q\d+$/.test(t);

// Candidates for a company name. First a full-text search restricted to
// organization classes; if that finds nothing (companies typed only as, say,
// "mobile payment platform"), a plain label search. Scoring rejects
// non-organizations either way.
export async function searchOrganizations(name: string): Promise<string[]> {
  const { response } = await withCache("wikidata", { op: "search", name: name.toLowerCase() }, TTL_SECONDS, () =>
    get({ action: "query", list: "search", srsearch: `${name} ${ORG_FILTER}`, srnamespace: "0", srlimit: "5" }),
  );
  const orgHits = ((response as { query?: { search?: { title?: unknown }[] } })?.query?.search ?? []).map((h) => h.title).filter(isQid);

  // The org-restricted full-text search can come back non-empty but wrong
  // (it ranks loosely on description text, so a common word like "Wise"
  // matches unrelated pages before the actual company). A plain label
  // search is always run too and merged in; scoreCandidate's name and
  // organization checks reject anything that doesn't actually fit.
  const { response: labels } = await withCache("wikidata", { op: "label-search", name: name.toLowerCase() }, TTL_SECONDS, () =>
    get({ action: "wbsearchentities", search: name, language: "en", uselang: "en", type: "item", limit: "5" }),
  );
  const labelHits = ((labels as { search?: { id?: unknown }[] })?.search ?? []).map((h) => h.id).filter(isQid);

  return [...new Set([...orgHits, ...labelHits])];
}

async function getEntitiesRaw(ids: string[], props: string): Promise<Json[]> {
  const unique = [...new Set(ids)].sort();
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += BATCH) batches.push(unique.slice(i, i + BATCH));
  return Promise.all(
    batches.map(async (batch) => {
      const { response } = await withCache("wikidata", { op: "entities", ids: batch, props }, TTL_SECONDS, () =>
        get({ action: "wbgetentities", ids: batch.join("|"), props, languages: "en" }),
      );
      return response;
    }),
  );
}

export async function getEntities(ids: string[]): Promise<WikidataEntity[]> {
  if (ids.length === 0) return [];
  const responses = await getEntitiesRaw(ids, "labels|aliases|descriptions|claims");
  return responses.flatMap(parseWikidataEntities);
}

// English labels for entity ids (used for countries).
export async function getLabels(ids: string[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  if (ids.length === 0) return labels;
  for (const response of await getEntitiesRaw(ids, "labels")) {
    for (const e of parseWikidataEntities(response)) if (e.label) labels.set(e.id, e.label);
  }
  return labels;
}
