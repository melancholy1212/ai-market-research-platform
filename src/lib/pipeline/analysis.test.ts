import { describe, expect, it } from "vitest";

import { buildAnalysisPrompt, parseAnalysis, type AnalysisSource } from "./analysis";

const sources: AnalysisSource[] = [
  {
    id: "uuid-1",
    title: "Exein raises $270M at $1.7B valuation",
    url: "https://www.exein.io/news/raise",
    publisher: "exein.io",
    publishedAt: "2026-09-15T10:00:00.000Z",
    snippet: "Rome-based Exein, which secures embedded devices, raised $270 million.",
    alsoReportedBy: 11,
  },
  {
    id: "uuid-2",
    title: "Hackuity lands €16M",
    url: "https://www.eu-startups.com/2026/09/hackuity",
    publisher: "EU-Startups",
    publishedAt: "2026-09-16T10:00:00.000Z",
    snippet: "Paris-based Hackuity (hackuity.io) raised €16 million for vulnerability management.",
    alsoReportedBy: 0,
  },
  { id: "uuid-3", title: "Secfix raises $12M", url: "https://tech.eu/secfix", publisher: "Tech.eu", publishedAt: null, snippet: null, alsoReportedBy: 0 },
];

const { prompt, aliases } = buildAnalysisPrompt({ query: "Cybersecurity startups in Europe", focus: null }, sources);
const NOW = Date.parse("2026-09-24T00:00:00Z");
const parse = (output: unknown) => parseAnalysis(JSON.stringify(output), aliases, sources, NOW);

const base = {
  overview: { summary: "European security startups are raising large rounds.", key_findings: [] },
  companies: [],
  recent_developments: [],
  emerging_trends: [],
};

describe("buildAnalysisPrompt", () => {
  it("fits the token budget by dropping trailing sources and shortening snippets", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ ...sources[0], id: `id-${i}`, snippet: "x".repeat(300) }));
    const large = buildAnalysisPrompt({ query: "q", focus: null }, many, 30_000);
    const small = buildAnalysisPrompt({ query: "q", focus: null }, many, 4_000);
    expect(large.included).toHaveLength(60);
    expect(small.included.length).toBeGreaterThan(10);
    expect(small.included.length).toBeLessThan(60);
    expect(small.prompt).not.toContain("x".repeat(141));
    // Kept sources are the first ones, in order, and only they get aliases.
    expect(small.included.map((s) => s.id)).toEqual(many.slice(0, small.included.length).map((s) => s.id));
    expect(small.aliases.size).toBe(small.included.length);
  });

  it("lists sources compactly with short aliases mapped to database ids", () => {
    expect(prompt).toContain("Research question: Cybersecurity startups in Europe");
    expect(prompt).toContain("[S1] Exein raises $270M at $1.7B valuation | exein.io | 2026-09-15 | exein.io | also reported by 11 other outlets");
    expect(prompt).toContain("[S3] Secfix raises $12M | Tech.eu | tech.eu");
    expect([...aliases]).toEqual([["S1", "uuid-1"], ["S2", "uuid-2"], ["S3", "uuid-3"]]);
  });
});

describe("parseAnalysis", () => {
  it("maps cited aliases back to database ids and keeps valid items", () => {
    const { analysis, stats } = parse({
      ...base,
      overview: { summary: "Summary.", key_findings: [{ text: "Exein raised $270M.", source_ids: ["S1"] }] },
      companies: [{ name: "Exein", country: "Italy", focus: "Embedded security", website: "", source_ids: ["S1"] }],
      recent_developments: [
        { title: "Exein raises $270M", summary: "", date: "2026-09-15", company: "Exein", source_ids: ["S1", "S1"] },
      ],
      emerging_trends: [{ title: "Large rounds", summary: "Big rounds.", source_ids: ["S1", "S2"] }],
    });
    expect(analysis.keyFindings).toEqual([{ text: "Exein raised $270M.", sourceIds: ["uuid-1"] }]);
    expect(analysis.companies[0]).toEqual({
      name: "Exein",
      entityType: "other",
      typeEvidence: null,
      country: "Italy",
      focus: "Embedded security",
      domain: null,
      sourceIds: ["uuid-1"],
    });
    expect(analysis.developments[0]).toMatchObject({ date: "2026-09-15", company: "Exein", summary: null, sourceIds: ["uuid-1"] });
    expect(analysis.trends[0].sourceIds).toEqual(["uuid-1", "uuid-2"]);
    expect(stats).toEqual({ droppedItems: 0, droppedCitations: 0, droppedWebsites: 0 });
  });

  it("drops invented source ids, and items left with none", () => {
    const { analysis, stats } = parse({
      ...base,
      companies: [
        { name: "Real Co", country: "", focus: "", website: "", source_ids: ["S2", "S99"] },
        { name: "Invented Co", country: "", focus: "", website: "", source_ids: ["S42"] },
        { name: "Uncited Co", country: "", focus: "", website: "", source_ids: [] },
      ],
    });
    expect(analysis.companies.map((c) => c.name)).toEqual(["Real Co"]);
    expect(analysis.companies[0].sourceIds).toEqual(["uuid-2"]);
    expect(stats.droppedCitations).toBe(2);
    expect(stats.droppedItems).toBe(2);
  });

  it("accepts a website only if the sources mention that exact domain", () => {
    const { analysis, stats } = parse({
      ...base,
      companies: [
        { name: "Hackuity", country: "France", focus: "", website: "https://www.hackuity.io/", source_ids: ["S2"] },
        { name: "Exein", country: "", focus: "", website: "exein.io", source_ids: ["S1"] },
        { name: "Secfix", country: "", focus: "", website: "secfix.com", source_ids: ["S3"] },
        { name: "Magazine AI", country: "", focus: "", website: "ai.com", source_ids: ["S3"] },
      ],
    });
    expect(analysis.companies.map((c) => c.domain)).toEqual(["hackuity.io", "exein.io", null, null]);
    expect(stats.droppedWebsites).toBe(2);
  });

  it("drops trends with a single source", () => {
    const { analysis } = parse({ ...base, emerging_trends: [{ title: "One-off", summary: "", source_ids: ["S1"] }] });
    expect(analysis.trends).toEqual([]);
  });

  it("drops malformed, future and impossible dates", () => {
    const { analysis } = parse({
      ...base,
      recent_developments: ["2026-13-01", "2027-01-01", "Sept 2026", "2026-02-30", "2026-09-10"].map((date) => ({
        title: `Dev ${date}`, summary: "", date, company: "", source_ids: ["S1"],
      })),
    });
    expect(analysis.developments.map((x) => x.date)).toEqual([null, null, null, null, "2026-09-10"]);
  });

  it("de-duplicates companies by name and respects limits", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `Co ${i % 20}`, country: "", focus: "", website: "", source_ids: ["S1"] }));
    const { analysis } = parse({ ...base, companies: many });
    expect(analysis.companies).toHaveLength(15);
    expect(new Set(analysis.companies.map((c) => c.name)).size).toBe(15);
  });

  it("tolerates source id spelling variants", () => {
    const { analysis } = parse({
      ...base,
      overview: { summary: "S.", key_findings: [{ text: "x", source_ids: ["s1", "source_2", " S3 "] }] },
    });
    expect(analysis.keyFindings[0].sourceIds).toEqual(["uuid-1", "uuid-2", "uuid-3"]);
  });

  it("reads entity types and rejects invented ones", () => {
    const { analysis } = parse({
      ...base,
      companies: [
        { name: "Exein", entity_type: "startup", type_evidence: "founded 2018, raised Series C", country: "", focus: "", website: "", source_ids: ["S1"] },
        { name: "Renesas", entity_type: "megacorp", type_evidence: "", country: "", focus: "", website: "", source_ids: ["S2"] },
      ],
    });
    expect(analysis.companies.map((c) => [c.entityType, c.typeEvidence])).toEqual([
      ["startup", "founded 2018, raised Series C"],
      ["other", null],
    ]);
  });

  it("tags contextual sources in the prompt", () => {
    const { prompt: p } = buildAnalysisPrompt({ query: "q", focus: null }, [{ ...sources[0], label: "contextual" }]);
    expect(p).toContain("[S1] [context] Exein raises");
  });

  it("rejects output without a summary or that is not JSON", () => {
    expect(() => parse({ ...base, overview: { summary: "", key_findings: [] } })).toThrow(/summary/);
    expect(() => parseAnalysis("{not json", aliases, sources, NOW)).toThrow(/JSON/);
  });
});
