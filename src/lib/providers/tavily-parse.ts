import { ProviderError } from "@/lib/http";

import type { SourceCandidate, SourceType } from "./types";

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function isoDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// Validates Tavily's response shape instead of trusting it. Individual
// results without a usable URL are dropped; a response without a results
// array at all is treated as malformed.
export function parseTavilyResponse(response: unknown, type: SourceType): SourceCandidate[] {
  const results = (response as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) {
    throw new ProviderError("tavily", "malformed", "response had no results array");
  }

  return results.flatMap((r): SourceCandidate[] => {
    const url = str(r?.url);
    if (!url) return [];
    return [
      {
        url,
        title: str(r.title),
        publisher: null,
        publishedAt: isoDate(r.published_date),
        snippet: str(r.content),
        type,
        score: typeof r.score === "number" ? r.score : null,
      },
    ];
  });
}
