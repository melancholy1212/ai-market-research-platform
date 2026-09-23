import { describe, expect, it } from "vitest";

import { assessVerification, rankCompanies, reconcileEntityType, type RankableCompany, type VerificationInput } from "./assess";

const NOW = new Date("2026-09-26T00:00:00Z");

describe("reconcileEntityType", () => {
  it("keeps the evidence-based type when nothing contradicts it", () => {
    expect(reconcileEntityType("startup", "founded 2021, raised a seed round", null, NOW)).toEqual({
      type: "startup",
      evidence: "founded 2021, raised a seed round",
    });
  });
  it("overrules a startup claim for old or publicly listed companies", () => {
    expect(reconcileEntityType("startup", "robotics firm", { inceptionYear: 2002, instanceOf: ["Q4830453"] }, NOW)).toEqual({
      type: "established_company",
      evidence: "founded 2002 (Wikidata)",
    });
    expect(reconcileEntityType("startup", null, { inceptionYear: 2019, instanceOf: ["Q891723"] }, NOW).type).toBe("established_company");
  });
  it("never turns an established company into a startup", () => {
    expect(reconcileEntityType("established_company", "listed chipmaker", { inceptionYear: 2020, instanceOf: [] }, NOW).type).toBe(
      "established_company",
    );
  });
});

describe("assessVerification", () => {
  const base: VerificationInput = { wikidataMatch: false, websiteSource: null, citedSourceUrls: [], country: null, wikidataCountry: null, domain: null };

  it("rates an official website plus reputable coverage as high without Wikidata", () => {
    const v = assessVerification({
      ...base,
      websiteSource: "clearbit",
      domain: "parloa.com",
      country: "Germany",
      citedSourceUrls: ["https://www.reuters.com/x", "https://observer.com/y"],
    });
    expect(v.confidence).toBe("high");
    expect(v.signals).toEqual(expect.arrayContaining(["website found by name match", "covered by reuters.com", "2 independent sources"]));
  });

  it("rates strong multi-source evidence as high", () => {
    expect(
      assessVerification({ ...base, citedSourceUrls: ["https://a.example/1", "https://b.example/2", "https://c.example/3"] }).confidence,
    ).toBe("high");
  });

  it("rates a website with limited support as medium", () => {
    expect(assessVerification({ ...base, websiteSource: "search", domain: "atom.jp", citedSourceUrls: ["https://blog.example/x"] }).confidence).toBe(
      "medium",
    );
  });

  it("rates a single weak mention as low and says so", () => {
    const v = assessVerification({ ...base, citedSourceUrls: ["https://blog.example/x"] });
    expect(v).toEqual({ confidence: "low", signals: ["single, weak source"] });
  });

  it("does not count the company's own site or press wires as independent coverage", () => {
    const v = assessVerification({
      ...base,
      domain: "exein.io",
      citedSourceUrls: ["https://www.exein.io/news", "https://www.globenewswire.com/x"],
    });
    expect(v.confidence).toBe("low");
  });

  it("notes when the country agrees across evidence", () => {
    const v = assessVerification({ ...base, websiteSource: "wikidata", domain: "triorb.co.jp", country: "Japan", wikidataMatch: true });
    expect(v.signals).toContain("country consistent across evidence");
    expect(v.confidence).toBe("high");
  });
});

describe("rankCompanies", () => {
  const c = (over: Partial<RankableCompany> & { name: string }): RankableCompany => ({
    entityType: "startup",
    country: "Japan",
    focus: "robotics",
    confidence: "medium",
    citationCount: 1,
    ...over,
  });
  const constraints = { entityType: "startup", geography: ["Japan"], topic: "robotics" };

  it("puts the requested entity type and geography first, then topic and evidence", () => {
    const ranked = rankCompanies(
      [
        c({ name: "Renesas", entityType: "established_company", confidence: "high", citationCount: 5 }),
        c({ name: "Foreign", country: "China" }),
        c({ name: "Weak", confidence: "low" }),
        c({ name: "Strong", confidence: "high", citationCount: 3 }),
        c({ name: "Offtopic", focus: "payments" }),
      ],
      constraints,
    );
    expect(ranked.map((x) => x.name)).toEqual(["Strong", "Weak", "Offtopic", "Foreign", "Renesas"]);
  });

  it("treats region constraints as covering their countries", () => {
    const ranked = rankCompanies([c({ name: "US", country: "United States" }), c({ name: "DE", country: "Germany" })], {
      entityType: "any",
      geography: ["Europe"],
      topic: "",
    });
    expect(ranked.map((x) => x.name)).toEqual(["DE", "US"]);
  });

  it("matches topic word variants, so wording does not outrank evidence", () => {
    const ranked = rankCompanies(
      [
        c({ name: "Noetra", focus: "AI robotics", confidence: "low" }),
        c({ name: "Rapyuta", focus: "cloud-based robot fleet management", confidence: "high" }),
        c({ name: "Rubin", focus: "humanoid robots", confidence: "medium" }),
      ],
      constraints,
    );
    expect(ranked.map((x) => x.name)).toEqual(["Rapyuta", "Rubin", "Noetra"]);
  });

  it("handles two-letter topics like AI", () => {
    const ranked = rankCompanies([c({ name: "Pay", focus: "payments" }), c({ name: "Aleph", focus: "AI language models" })], {
      entityType: "startup",
      geography: ["Japan"],
      topic: "AI",
    });
    expect(ranked.map((x) => x.name)).toEqual(["Aleph", "Pay"]);
  });

  it("keeps the original order without constraints", () => {
    expect(rankCompanies([c({ name: "B" }), c({ name: "A" })], null).map((x) => x.name)).toEqual(["B", "A"]);
  });
});
