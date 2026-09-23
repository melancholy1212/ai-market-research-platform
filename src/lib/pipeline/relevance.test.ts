import { describe, expect, it } from "vitest";

import { judgeStories, relevanceContext, scoreRelevance, summarizeReasons, type RelevanceInput } from "./relevance";

// Cases taken from real research runs.
const NOW = Date.parse("2026-09-24T00:00:00Z");
const src = (over: Partial<RelevanceInput>): RelevanceInput => ({
  title: null,
  snippet: null,
  url: "https://news.example/article",
  publishedAt: "2026-09-01T00:00:00Z",
  foundByCount: 1,
  ...over,
});
const score = (query: string, source: RelevanceInput) => scoreRelevance(source, relevanceContext({ query, focus: null }), NOW);

describe("relevanceContext", () => {
  it("separates topic, place and generic words, keeping short acronyms", () => {
    expect(relevanceContext({ query: "AI startups in Germany", focus: null })).toMatchObject({ topic: ["ai"], placeNames: ["germany"] });
    expect(relevanceContext({ query: "Fintech startups in India", focus: "lending and payments" })).toMatchObject({
      topic: ["fintech"],
      focusTopic: ["lending", "payment"],
      placeNames: ["india"],
    });
  });
});

describe("scoreRelevance", () => {
  it("keeps sources about the topic and the place", () => {
    expect(score("AI startups in Germany", src({ title: "German AI startup Parloa triples valuation to $3 billion" })).relevant).toBe(true);
    // Place from a city, topic from the snippet.
    expect(score("AI startups in Germany", src({ title: "Helsing raises €600M", snippet: "Munich-based Helsing builds AI software for defence." })).relevant).toBe(true);
    // Compound topic words.
    expect(score("Cybersecurity startups in Europe", src({ title: "Hackuity lands €16M", snippet: "The French cyber security firm..." })).relevant).toBe(true);
  });

  it("drops full-text matches that are about something else", () => {
    const r = score("AI startups in Germany", src({ title: "Cheque-in: 8 startups raised $113 million this week", url: "https://www.startupdaily.net/x" }));
    expect(r.relevant).toBe(false);
    expect(r.reasons).toEqual(["does not mention AI", "not about Germany"]);
  });

  it("drops strong topic matches about a different place", () => {
    const r = score("Robotics startups in Japan", src({ title: "Why China’s humanoid robot industry is winning the early market" }));
    expect(r.relevant).toBe(false);
    expect(r.reasons).toContain("not about Japan");
  });

  it("does not let bonuses lift an off-place source over the threshold", () => {
    expect(score("Robotics startups in Japan", src({ title: "Korea’s biggest manufacturers back Config, the TSMC of robot data", foundByCount: 3 })).relevant).toBe(false);
  });

  it("uses a regional outlet's home region as place evidence", () => {
    const inc42 = src({ title: "Kissht, Ola Electric & More: Why Listed Startups Keep Going Back", snippet: "The fintech lender Kissht...", url: "https://inc42.com/features/x" });
    expect(score("Fintech startups in India", inc42).relevant).toBe(true);
    // A regional outlet elsewhere is not evidence: TechCabal is African.
    const techcabal = src({ title: "TechCabal Daily – IPO gold rush, fintech gridlock", url: "https://techcabal.com/x" });
    expect(score("Fintech startups in India", techcabal).relevant).toBe(false);
  });

  it("never keeps job listings, but keeps articles about jobs", () => {
    for (const title of [
      "Best Artificial Intelligence Companies to Work for in Germany 2026",
      "Fintech Startup Jobs in India (8000+ Open Roles)",
      "List of top Fintech & Payments companies hiring in India",
      "Top 73 India Startups — Newly Funded & Hiring",
    ]) {
      const r = score(title.includes("India") ? "Fintech startups in India" : "AI startups in Germany", src({ title }));
      expect(r.relevant, title).toBe(false);
      expect(r.reasons).toContain("job listing");
    }
    expect(score("Robotics startups in Japan", src({ title: "In Japan, the robot isn’t coming for your job; it’s filling the one nobody wants" })).relevant).toBe(true);
  });

  it("penalizes old articles", () => {
    const old = score("Cybersecurity startups in Europe", src({ title: "European cybersecurity startup raises seed", publishedAt: "2017-11-02T00:00:00Z" }));
    expect(old.reasons).toContain("published 8 years ago");
    expect(old.score).toBeLessThan(1);
  });

  it("does not treat the pronoun 'us' as the United States", () => {
    expect(score("AI startups in the US", src({ title: "Talk to us about AI" })).relevant).toBe(false);
    expect(score("AI startups in the US", src({ title: "US AI startups raised a record" })).relevant).toBe(true);
  });
});

describe("judgeStories", () => {
  const ctx = relevanceContext({ query: "AI startups in Germany", focus: null });
  const on = (title: string) => src({ title });

  it("rates a story by its best source", () => {
    const [story] = judgeStories([[on("Parloa raises $350M"), on("German AI startup Parloa raises $350M")]], ctx, NOW);
    expect(story.relevant).toBe(true);
    expect(story.members.map((m) => m.relevant)).toEqual([false, true]);
  });

  it("promotes the best partial matches up to the minimum, never pure noise or job listings", () => {
    const stories = [
      [on("AI is reshaping manufacturing")], // topic only: capped below threshold, score 0.4
      [on("Cheque-in: 8 startups raised $113 million")], // nothing: score 0
      [on("Best Artificial Intelligence Companies to Work for in Germany 2026")], // job listing
    ];
    const judged = judgeStories(stories, ctx, NOW);
    expect(judged.map((j) => [j.relevant, j.promoted])).toEqual([
      [true, true],
      [false, false],
      [false, false],
    ]);
  });

  it("summarizes why stories were set aside", () => {
    const judged = judgeStories(
      [[on("Cheque-in: 8 startups raised $113 million")], [on("Uber takeover in Nigeria")], [on("Fintech Startup Jobs in India (8000+ Open Roles)")]],
      ctx,
      NOW,
    );
    // With only 3 stories and no partial matches, nothing is promoted.
    expect(summarizeReasons(judged)).toBe("2 not about Germany, 1 job listing");
  });
});
