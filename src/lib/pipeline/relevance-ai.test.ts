import { describe, expect, it } from "vitest";

import { buildRelevancePrompt, fallbackClassification, fallbackConstraints, parseRelevance } from "./relevance-ai";

const sources = [
  { id: "u1", title: "Tokyo robotics startup Mujin raises $100M", url: "https://techcrunch.com/a", publisher: "TechCrunch", publishedAt: "2026-09-01T00:00:00Z", snippet: "Mujin builds..." },
  { id: "u2", title: "Cheque-in: 8 startups raised $113 million", url: "https://www.startupdaily.net/b", publisher: "Startup Daily", publishedAt: null, snippet: null },
];
const { prompt, aliases } = buildRelevancePrompt({ query: "Robotics startups in Japan", focus: null }, sources);

describe("buildRelevancePrompt", () => {
  it("lists every source with an alias", () => {
    expect(prompt).toContain("Research question: Robotics startups in Japan");
    expect(prompt).toContain("[S1] Tokyo robotics startup Mujin raises $100M | TechCrunch | 2026-09-01 | techcrunch.com");
    expect(prompt).toContain("[S2] Cheque-in: 8 startups raised $113 million | Startup Daily | startupdaily.net");
    expect([...aliases]).toEqual([["S1", "u1"], ["S2", "u2"]]);
  });
});

describe("parseRelevance", () => {
  const output = {
    constraints: { topic: "robotics", geography: ["Japan"], entity_type: "startup", industry: "robotics", time_range: "" },
    sources: [
      { id: "S1", label: "direct", score: 0.95, reason: "Japanese robotics startup funding" },
      { id: "S2", label: "irrelevant", score: 0.05, reason: "Australian startup round-up, not Japan" },
    ],
  };

  it("maps aliases to ids and reads constraints", () => {
    const { constraints, classifications } = parseRelevance(JSON.stringify(output), aliases);
    expect(constraints).toEqual({ topic: "robotics", geography: ["Japan"], entityType: "startup", industry: "robotics", timeRange: null });
    expect(classifications.get("u1")).toEqual({ label: "direct", score: 0.95, reason: "Japanese robotics startup funding" });
    expect(classifications.get("u2")?.label).toBe("irrelevant");
  });

  it("ignores unknown ids, invalid labels and duplicates, and clamps scores", () => {
    const { classifications } = parseRelevance(
      JSON.stringify({
        sources: [
          { id: "S1", label: "direct", score: 7, reason: "x" },
          { id: "S1", label: "irrelevant", score: 0, reason: "dup" },
          { id: "S2", label: "maybe", score: 0.5, reason: "bad label" },
          { id: "S9", label: "direct", score: 1, reason: "unknown" },
        ],
      }),
      aliases,
    );
    expect([...classifications.keys()]).toEqual(["u1"]);
    expect(classifications.get("u1")?.score).toBe(1);
  });

  it("falls back to a neutral entity constraint and tolerates missing constraints", () => {
    const { constraints } = parseRelevance(JSON.stringify({ sources: [{ id: "S1", label: "direct", score: 1, reason: "r" }] }), aliases);
    expect(constraints).toBeNull();
    const withBad = parseRelevance(JSON.stringify({ constraints: { topic: "x", entity_type: "unicorn" }, sources: output.sources }), aliases);
    expect(withBad.constraints?.entityType).toBe("any");
  });

  it("rejects unusable output", () => {
    expect(() => parseRelevance("nope", aliases)).toThrow(/JSON/);
    expect(() => parseRelevance(JSON.stringify({ sources: "x" }), aliases)).toThrow(/sources array/);
    expect(() => parseRelevance(JSON.stringify({ sources: [{ id: "S9", label: "direct" }] }), aliases)).toThrow(/no usable/);
  });
});

describe("fallback", () => {
  it("derives the entity constraint from the question", () => {
    const k = { topic: ["robotic"], placeNames: ["japan"] };
    expect(fallbackConstraints({ query: "Robotics startups in Japan", focus: null }, k).entityType).toBe("startup");
    expect(fallbackConstraints({ query: "Robotics companies in Japan", focus: null }, k).entityType).toBe("any");
    expect(fallbackConstraints({ query: "Climate tech investors in Europe", focus: null }, k).entityType).toBe("investor");
  });

  it("maps keyword scores onto labels", () => {
    expect(fallbackClassification({ score: 0.9, relevant: true, reasons: [] }).label).toBe("direct");
    expect(fallbackClassification({ score: 0.5, relevant: true, reasons: ["does not mention AI"] })).toEqual({
      label: "contextual",
      score: 0.5,
      reason: "does not mention AI",
    });
    expect(fallbackClassification({ score: 0.1, relevant: false, reasons: ["not about Japan", "found by 2 searches"] }).reason).toBe("not about Japan");
  });
});
