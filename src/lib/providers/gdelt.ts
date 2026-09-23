import "server-only";

import { ProviderError, requestText } from "@/lib/http";
import type { Json } from "@/lib/supabase/database.types";

import { withCache } from "./cache";
import { gdeltKeywords, parseGdeltResponse } from "./gdelt-parse";
import type { SearchProvider, SearchRequest } from "./types";

const ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";
const TTL_SECONDS = 3 * 60 * 60;

// GDELT DOC 2.0 API: free, no key, covers roughly the last three months of
// global news. It allows about one request every 5 seconds per IP, so
// rate limiting is expected and handled rather than treated as an outage.
export const gdelt: SearchProvider = {
  id: "gdelt",
  label: "GDELT news",
  supports: ["news"],

  isConfigured: () => true,

  async search(request: SearchRequest) {
    const keywords = gdeltKeywords(request.text);
    if (!keywords) return { candidates: [], fromCache: false };

    const params = {
      query: `${keywords} sourcelang:english`,
      mode: "ArtList",
      format: "json",
      maxrecords: String(Math.min(request.maxResults, 250)),
      timespan: "3months",
      sort: "HybridRel",
    };

    const { response, fromCache } = await withCache("gdelt", params, TTL_SECONDS, async () => {
      const text = await requestText(`${ENDPOINT}?${new URLSearchParams(params)}`, {
        provider: "gdelt",
        timeoutMs: 20_000,
        retries: 1,
        rateLimitBackoffMs: 6_000,
      });
      // Query errors come back as plain text with HTTP 200.
      try {
        return JSON.parse(text) as Json;
      } catch {
        throw new ProviderError("gdelt", "malformed", "GDELT rejected the query");
      }
    });

    return { candidates: parseGdeltResponse(response), fromCache };
  },
};
