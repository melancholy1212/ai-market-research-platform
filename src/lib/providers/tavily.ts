import "server-only";

import { ProviderError, requestJson } from "@/lib/http";
import type { Json } from "@/lib/supabase/database.types";
import { displayHost } from "@/lib/url";

import { withCache } from "./cache";
import { parseTavilyResponse } from "./tavily-parse";
import type { SearchProvider, SearchRequest } from "./types";

const ENDPOINT = "https://api.tavily.com/search";
const TTL_SECONDS = { web: 24 * 60 * 60, news: 6 * 60 * 60 } as const;

// Tavily answers 432/433 when the plan's credits are used up.
const classifyStatus = (status: number) =>
  status === 432 || status === 433 ? ("quota_exceeded" as const) : undefined;

export const tavily: SearchProvider = {
  id: "tavily",
  label: "Tavily web search",
  supports: ["web", "news"],

  isConfigured: () => Boolean(process.env.TAVILY_API_KEY),

  async search(request: SearchRequest) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) throw new ProviderError("tavily", "unauthorized", "TAVILY_API_KEY is not set");

    // Basic depth costs 1 credit per call (advanced costs 2).
    const body = {
      query: request.text,
      topic: request.type === "news" ? "news" : "general",
      search_depth: "basic",
      max_results: request.maxResults,
      include_published_date: true,
      ...(request.type === "news" ? { time_range: "year" } : {}),
    };

    const { response, fromCache } = await withCache("tavily", body, TTL_SECONDS[request.type], async () =>
      (await requestJson(ENDPOINT, {
        provider: "tavily",
        init: {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        timeoutMs: 20_000,
        classifyStatus,
      })) as Json,
    );

    const candidates = parseTavilyResponse(response, request.type).map((c) => ({
      ...c,
      publisher: c.publisher ?? displayHost(c.url),
    }));
    return { candidates, fromCache };
  },
};
