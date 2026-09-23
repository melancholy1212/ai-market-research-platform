import { describe, expect, it } from "vitest";

import { gdeltKeywords, parseGdeltResponse, parseSeenDate } from "./gdelt-parse";

describe("gdeltKeywords", () => {
  it("keeps the meaningful terms of a question", () => {
    expect(gdeltKeywords("Research cybersecurity startups in Europe")).toBe("cybersecurity startups europe");
    expect(
      gdeltKeywords("Research cybersecurity startups in Europe. Identify the major companies, recent developments"),
    ).toBe("cybersecurity startups europe");
  });

  it("caps the number of terms and drops duplicates", () => {
    expect(gdeltKeywords("fintech fintech lending payments banking", 3)).toBe("fintech lending payments");
  });

  it("keeps hyphenated and non-English terms", () => {
    expect(gdeltKeywords("e-commerce in Deutschland")).toBe("e-commerce deutschland");
  });

  it("returns null when nothing usable is left", () => {
    expect(gdeltKeywords("the top AI in EU")).toBeNull();
    expect(gdeltKeywords("")).toBeNull();
  });
});

describe("parseSeenDate", () => {
  it("parses GDELT timestamps", () => {
    expect(parseSeenDate("20260923T141500Z")).toBe("2026-09-23T14:15:00.000Z");
  });
  it("rejects anything else", () => {
    for (const bad of ["2026-09-23", "", null, 20260923, "20261399T000000Z", "20260230T000000Z"]) {
      expect(parseSeenDate(bad)).toBeNull();
    }
  });
});

describe("parseGdeltResponse", () => {
  it("maps articles", () => {
    expect(
      parseGdeltResponse({
        articles: [
          { url: "https://news.example/a", title: "Raise", domain: "news.example", seendate: "20260901T080000Z" },
        ],
      }),
    ).toEqual([
      {
        url: "https://news.example/a",
        title: "Raise",
        publisher: "news.example",
        publishedAt: "2026-09-01T08:00:00.000Z",
        snippet: null,
        type: "news",
        score: null,
      },
    ]);
  });

  it("treats an empty object as no results", () => {
    expect(parseGdeltResponse({})).toEqual([]);
  });

  it("rejects non-objects and a non-array articles field", () => {
    for (const bad of [null, [], "text", { articles: {} }]) {
      expect(() => parseGdeltResponse(bad)).toThrow();
    }
  });
});
