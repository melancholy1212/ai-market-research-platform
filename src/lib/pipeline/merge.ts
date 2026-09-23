import type { SourceCandidate, SourceType } from "@/lib/providers/types";
import { normalizeUrl } from "@/lib/url";

export type Discovery = {
  provider: string;
  query: string;
  type: SourceType;
  rank: number;
  score: number | null;
};

export type MergedSource = {
  url: string;
  canonicalUrl: string;
  title: string | null;
  publisher: string | null;
  publishedAt: string | null;
  snippet: string | null;
  type: SourceType;
  // Every search that returned this URL. Being found by several searches
  // is a useful relevance signal for later stages.
  foundBy: Discovery[];
};

export type MergeInput = {
  provider: string;
  query: string;
  candidates: SourceCandidate[];
};

export type MergeStats = {
  received: number;
  invalidUrls: number;
  duplicates: number;
};

// Normalizes candidate URLs and folds exact duplicates (same canonical URL)
// into one source, filling missing fields from later duplicates. Fuzzy
// duplicates (same story, different URL) are a later stage.
export function mergeCandidates(inputs: MergeInput[]): { sources: MergedSource[]; stats: MergeStats } {
  const byCanonical = new Map<string, MergedSource>();
  const stats: MergeStats = { received: 0, invalidUrls: 0, duplicates: 0 };

  for (const { provider, query, candidates } of inputs) {
    candidates.forEach((c, index) => {
      stats.received++;
      const canonicalUrl = normalizeUrl(c.url);
      if (!canonicalUrl) {
        stats.invalidUrls++;
        return;
      }
      const discovery: Discovery = { provider, query, type: c.type, rank: index + 1, score: c.score };
      const existing = byCanonical.get(canonicalUrl);
      if (!existing) {
        byCanonical.set(canonicalUrl, {
          url: c.url,
          canonicalUrl,
          title: c.title,
          publisher: c.publisher,
          publishedAt: c.publishedAt,
          snippet: c.snippet,
          type: c.type,
          foundBy: [discovery],
        });
        return;
      }
      stats.duplicates++;
      existing.foundBy.push(discovery);
      existing.title ??= c.title;
      existing.publisher ??= c.publisher;
      existing.publishedAt ??= c.publishedAt;
      existing.snippet ??= c.snippet;
      // A URL any news search returned is news coverage.
      if (c.type === "news") existing.type = "news";
    });
  }

  return { sources: [...byCanonical.values()], stats };
}
