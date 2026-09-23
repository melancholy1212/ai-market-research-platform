import "server-only";

import { requestJson } from "@/lib/http";
import { withCache } from "@/lib/providers/cache";
import type { Json } from "@/lib/supabase/database.types";

import { pickSuggestedDomain, type NameDomain } from "./website";

// Company name -> domain via Clearbit Autocomplete: free, no key, about 600
// requests per minute, and much better coverage of startups than Wikidata.
// It is unmaintained and has no SLA (Clearbit retired its other free APIs),
// so it is one step in a chain, never the only one, and a failure just
// moves on to the next step.

const ENDPOINT = "https://autocomplete.clearbit.com/v1/companies/suggest";
const TTL_SECONDS = 21 * 24 * 60 * 60;

function suggestions(response: Json): NameDomain[] {
  if (!Array.isArray(response)) return [];
  return response.flatMap((s) => {
    const r = s as { name?: unknown; domain?: unknown };
    return typeof r.name === "string" && typeof r.domain === "string" ? [{ name: r.name, domain: r.domain }] : [];
  });
}

export async function clearbitDomain(name: string, country: string | null): Promise<string | null> {
  // Raw suggestions are cached per name; the pick runs on every read, so
  // rule changes apply to cached data.
  const { response } = await withCache("clearbit", { op: "suggest", name: name.toLowerCase() }, TTL_SECONDS, async () =>
    (await requestJson(`${ENDPOINT}?${new URLSearchParams({ query: name })}`, {
      provider: "clearbit",
      timeoutMs: 10_000,
      retries: 1,
    })) as Json,
  );
  return pickSuggestedDomain(suggestions(response), name, country);
}
