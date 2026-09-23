import { describe, expect, it } from "vitest";

import type { SourceCandidate } from "@/lib/providers/types";

import { mergeCandidates } from "./merge";
import { buildSearchPlan } from "./plan";

const candidate = (over: Partial<SourceCandidate>): SourceCandidate => ({
  url: "https://example.com/a",
  title: null,
  publisher: null,
  publishedAt: null,
  snippet: null,
  type: "web",
  score: null,
  ...over,
});

describe("buildSearchPlan", () => {
  it("runs web, news and news-site searches for the question", () => {
    const plan = buildSearchPlan({ query: "Fintech in Brazil", focus: null });
    expect(plan.map((t) => `${t.providerId}:${t.request.type}`)).toEqual([
      "tavily:web",
      "tavily:news",
      "rss:news",
    ]);
    expect(plan.every((t) => t.request.text === "Fintech in Brazil")).toBe(true);
  });

  it("adds a focused web search when a focus is given", () => {
    const plan = buildSearchPlan({ query: "Fintech in Brazil", focus: "lending" });
    expect(plan).toHaveLength(4);
    expect(plan[3].request.text).toBe("Fintech in Brazil lending");
  });
});

describe("mergeCandidates", () => {
  it("folds URLs that normalize to the same canonical URL", () => {
    const { sources, stats } = mergeCandidates([
      { provider: "tavily", query: "q", candidates: [candidate({ url: "https://www.example.com/a/?utm_source=x", title: "A" })] },
      { provider: "rss", query: "q", candidates: [candidate({ url: "http://example.com/a", type: "news", publishedAt: "2026-09-01T00:00:00.000Z" })] },
    ]);
    expect(sources).toHaveLength(1);
    expect(stats).toEqual({ received: 2, invalidUrls: 0, duplicates: 1 });
    expect(sources[0]).toMatchObject({
      canonicalUrl: "https://example.com/a",
      url: "https://www.example.com/a/?utm_source=x",
      title: "A",
      publishedAt: "2026-09-01T00:00:00.000Z",
      type: "news",
    });
    expect(sources[0].foundBy.map((d) => d.provider)).toEqual(["tavily", "rss"]);
  });

  it("keeps the first non-null value for each field", () => {
    const { sources } = mergeCandidates([
      { provider: "p", query: "q", candidates: [candidate({ title: "First" }), candidate({ title: "Second", snippet: "S" })] },
    ]);
    expect(sources[0]).toMatchObject({ title: "First", snippet: "S" });
  });

  it("records rank within each search", () => {
    const { sources } = mergeCandidates([
      { provider: "p", query: "q", candidates: [candidate({ url: "https://a.test/1" }), candidate({ url: "https://a.test/2" })] },
    ]);
    expect(sources.map((s) => s.foundBy[0].rank)).toEqual([1, 2]);
  });

  it("drops candidates with unusable URLs and counts them", () => {
    const { sources, stats } = mergeCandidates([
      { provider: "p", query: "q", candidates: [candidate({ url: "javascript:alert(1)" }), candidate({ url: "not a url" })] },
    ]);
    expect(sources).toEqual([]);
    expect(stats.invalidUrls).toBe(2);
  });
});
