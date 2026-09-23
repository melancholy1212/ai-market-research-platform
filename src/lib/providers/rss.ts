import "server-only";

import { ProviderError, requestText } from "@/lib/http";
import { searchKeywords } from "@/lib/keywords";

import { withCache } from "./cache";
import { parseRssFeed } from "./rss-parse";
import { RSS_SITES, searchFeedUrl, type RssSite } from "./rss-sites";
import type { SearchProvider, SearchRequest, SourceCandidate } from "./types";

const TTL_SECONDS = 6 * 60 * 60;
const MAX_FEED_BYTES = 3_000_000;
const SNIPPET_CHARS = 600;
// Search feeds list results newest first; the first few per site are enough
// and keep one prolific site from dominating.
const ITEMS_PER_SITE = 6;

async function searchSite(
  site: RssSite,
  keywords: string,
): Promise<{ candidates: SourceCandidate[]; fromCache: boolean }> {
  const provider = `rss:${site.id}`;
  const url = searchFeedUrl(site, keywords);

  const { response, fromCache } = await withCache("rss", { site: site.id, keywords }, TTL_SECONDS, async () => {
    const xml = await requestText(url, { provider, timeoutMs: 12_000, retries: 1 });
    if (xml.length > MAX_FEED_BYTES) throw new ProviderError(provider, "malformed", "feed was too large");
    // Validate before caching so a blocked/HTML response is never cached.
    parseRssFeed(xml, provider);
    return xml;
  });
  if (typeof response !== "string") throw new ProviderError(provider, "malformed", "cached feed was not text");

  const candidates = parseRssFeed(response, provider)
    .filter((item) => item.link)
    .slice(0, ITEMS_PER_SITE)
    .map((item) => ({
      url: item.link!,
      title: item.title,
      publisher: site.name,
      publishedAt: item.publishedAt,
      snippet: item.description ? item.description.slice(0, SNIPPET_CHARS) : null,
      type: "news" as const,
      score: null,
    }));
  return { candidates, fromCache };
}

// Free, keyless news search across a curated set of news sites. Individual
// sites failing (blocked, down, changed) is expected and reported as a
// warning; the search fails only if no site could be read.
export const rssSearch: SearchProvider = {
  id: "rss",
  label: "News site search",
  supports: ["news"],

  isConfigured: () => true,

  async search(request: SearchRequest) {
    const keywords = searchKeywords(request.text);
    if (!keywords) return { candidates: [], fromCache: false };

    const settled = await Promise.allSettled(RSS_SITES.map((site) => searchSite(site, keywords)));
    const failed = RSS_SITES.filter((_, i) => settled[i].status === "rejected");
    if (failed.length === RSS_SITES.length) {
      throw new ProviderError("rss", "network", "no news site could be read");
    }

    const candidates = settled
      .flatMap((r) => (r.status === "fulfilled" ? r.value.candidates : []))
      .slice(0, request.maxResults);
    const warnings = failed.length
      ? [`Could not read ${failed.length} of ${RSS_SITES.length} news sites (${failed.map((s) => s.name).join(", ")}).`]
      : [];
    const fromCache = settled.every((r) => r.status === "fulfilled" && r.value.fromCache);
    return { candidates, fromCache, warnings };
  },
};
