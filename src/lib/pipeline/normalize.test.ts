import { describe, expect, it } from "vitest";

import type { MergedSource } from "./merge";
import { canonicalPublisher, cleanTitle, isJunkTitle, normalizeSources, sanePublishedAt } from "./normalize";

// Titles below are taken from real research runs.
describe("cleanTitle", () => {
  const clean = (title: string, publisher: string | null, url: string) => cleanTitle(title, publisher, url)?.title;

  it("strips a trailing site name that matches the publisher or host", () => {
    expect(clean("Best Cyber Security Companies to Work for in Europe 2026 | Wellfound", "wellfound.com", "https://wellfound.com/x")).toBe(
      "Best Cyber Security Companies to Work for in Europe 2026",
    );
    expect(clean("Financial technology in India - Wikipedia", "en.wikipedia.org", "https://en.wikipedia.org/wiki/x")).toBe(
      "Financial technology in India",
    );
    expect(clean("Top Cybersecurity startups in Europe (50) | Dealroom.co", "dealroom.co", "https://dealroom.co/x")).toBe(
      "Top Cybersecurity startups in Europe (50)",
    );
    expect(clean("cybersecurity startups news | EU-Startups", "EU-Startups", "https://www.eu-startups.com/tag/x")).toBe(
      "cybersecurity startups news",
    );
  });

  it("keeps a trailing segment that is part of the headline", () => {
    expect(clean("Secfix raises $12M - here is why it matters", "tech.eu", "https://tech.eu/x")).toBe(
      "Secfix raises $12M - here is why it matters",
    );
    // Publisher name that does not match the host is left alone.
    expect(clean("Europe’s Cybersecurity Depends on the United States - Stiftung Wissenschaft und Politik", "swp-berlin.org", "https://www.swp-berlin.org/x")).toBe(
      "Europe’s Cybersecurity Depends on the United States - Stiftung Wissenschaft und Politik",
    );
  });

  it("does not strip when too little headline would remain", () => {
    expect(clean("Fintech | Inc42", "Inc42", "https://inc42.com/x")).toBe("Fintech | Inc42");
  });

  it("removes leading emoji and marks truncated titles", () => {
    expect(clean("👨🏿‍🚀TechCabal Daily – Africa gets a pep talk", "TechCabal", "https://techcabal.com/x")).toBe(
      "TechCabal Daily – Africa gets a pep talk",
    );
    expect(cleanTitle("ANOZR WAY and Uncovery fly to the ...", null, "https://ecs-org.eu/x")).toEqual({
      title: "ANOZR WAY and Uncovery fly to the",
      truncated: true,
    });
  });

  it("decodes entities", () => {
    expect(clean("France&#8217;s Hackuity lands &euro;16 million", null, "https://a.test/x")).toBe("France’s Hackuity lands €16 million");
  });
});

describe("isJunkTitle", () => {
  it("recognizes block and error pages", () => {
    for (const t of ["Access Denied", "Just a moment...", "403 Forbidden", "Page not found | Site", "Attention Required! | Cloudflare"]) {
      expect(isJunkTitle(t)).toBe(true);
    }
  });
  it("does not flag real headlines that start with the same words", () => {
    for (const t of ["Access denied: how zero-trust startups are raising", "Error-correcting quantum startup raises $20M"]) {
      expect(isJunkTitle(t)).toBe(false);
    }
  });
});

describe("canonicalPublisher", () => {
  it("maps known outlet hosts to one name", () => {
    expect(canonicalPublisher("https://inc42.com/buzz/x", "inc42.com")).toBe("Inc42");
    expect(canonicalPublisher("https://inc42.com/buzz/x", "Inc42")).toBe("Inc42");
  });
  it("keeps real publisher names and falls back to the host", () => {
    expect(canonicalPublisher("https://news.example/x", "Example News")).toBe("Example News");
    expect(canonicalPublisher("https://www.reuters.com/x", "reuters.com")).toBe("reuters.com");
    expect(canonicalPublisher("https://www.reuters.com/x", null)).toBe("reuters.com");
  });
});

describe("sanePublishedAt", () => {
  const now = Date.parse("2026-09-24T00:00:00Z");
  it("drops future and implausibly old dates", () => {
    expect(sanePublishedAt("2027-01-01T00:00:00.000Z", now)).toBeNull();
    expect(sanePublishedAt("1970-01-01T00:00:00.000Z", now)).toBeNull();
    expect(sanePublishedAt("2026-09-23T10:00:00.000Z", now)).toBe("2026-09-23T10:00:00.000Z");
  });
});

describe("normalizeSources", () => {
  const source = (over: Partial<MergedSource>): MergedSource => ({
    url: "https://a.test/x",
    canonicalUrl: "https://a.test/x",
    title: "A headline about things",
    publisher: null,
    publishedAt: null,
    snippet: null,
    type: "web",
    foundBy: [],
    ...over,
  });

  it("drops junk pages and counts them", () => {
    const { sources, stats } = normalizeSources([source({ title: "Access Denied" }), source({})]);
    expect(sources).toHaveLength(1);
    expect(stats.junk).toBe(1);
  });
});
