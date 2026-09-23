import "server-only";

import { ProviderError, requestJson } from "@/lib/http";
import { readCache, withCache } from "@/lib/providers/cache";
import type { Json } from "@/lib/supabase/database.types";

import { pickOfficialDomain } from "./website";

// Website lookup through Tavily web search: the last step, for companies
// that neither the sources, Wikidata nor Clearbit could give a website for.
// Costs 1 credit per uncached lookup, so callers cap it per research.

const ENDPOINT = "https://api.tavily.com/search";
const TTL_SECONDS = 21 * 24 * 60 * 60;

const requestFor = (name: string, hint: string) => ({
  query: `${name} ${hint} official website`.replace(/\s+/g, " ").trim(),
  topic: "general",
  search_depth: "basic",
  max_results: 6,
});

// Raw responses are cached; this runs on every read, so parser changes apply.
function domainFrom(response: Json | undefined, name: string): string | null {
  const results = (response as { results?: { url?: unknown }[] } | undefined)?.results;
  if (!Array.isArray(results)) return null;
  return pickOfficialDomain(results.map((r) => r.url).filter((u): u is string => typeof u === "string"), name);
}

export const tavilyWebsiteConfigured = () => Boolean(process.env.TAVILY_API_KEY);

// Stored answer without calling Tavily: undefined if never looked up.
export async function cachedTavilyWebsite(name: string, hint: string): Promise<string | null | undefined> {
  const response = await readCache("tavily", { op: "website", ...requestFor(name, hint) });
  return response === undefined ? undefined : domainFrom(response, name);
}

export async function findWebsiteWithTavily(name: string, hint: string): Promise<{ domain: string | null; fromCache: boolean }> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new ProviderError("tavily", "unauthorized", "TAVILY_API_KEY is not set");
  const body = requestFor(name, hint);
  const { response, fromCache } = await withCache("tavily", { op: "website", ...body }, TTL_SECONDS, async () =>
    (await requestJson(ENDPOINT, {
      provider: "tavily",
      init: {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      timeoutMs: 15_000,
      retries: 1,
      classifyStatus: (s) => (s === 432 || s === 433 ? "quota_exceeded" : undefined),
    })) as Json,
  );
  return { domain: domainFrom(response, name), fromCache };
}
