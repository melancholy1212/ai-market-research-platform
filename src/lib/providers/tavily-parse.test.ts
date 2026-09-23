import { describe, expect, it } from "vitest";

import { parseTavilyResponse } from "./tavily-parse";

describe("parseTavilyResponse", () => {
  it("maps results and normalizes dates", () => {
    const parsed = parseTavilyResponse(
      {
        results: [
          {
            url: "https://example.com/a",
            title: " Funding round ",
            content: "Snippet",
            score: 0.9,
            published_date: "Tue, 02 Sep 2026 10:00:00 GMT",
          },
        ],
      },
      "news",
    );
    expect(parsed).toEqual([
      {
        url: "https://example.com/a",
        title: "Funding round",
        publisher: null,
        publishedAt: "2026-09-02T10:00:00.000Z",
        snippet: "Snippet",
        type: "news",
        score: 0.9,
      },
    ]);
  });

  it("tolerates missing and wrongly typed fields", () => {
    const [only] = parseTavilyResponse(
      { results: [{ url: "https://example.com/b", title: 5, published_date: "not a date", score: "high" }] },
      "web",
    );
    expect(only).toMatchObject({ title: null, publishedAt: null, snippet: null, score: null });
  });

  it("drops results without a URL", () => {
    expect(parseTavilyResponse({ results: [{ title: "no url" }, null, { url: "" }] }, "web")).toEqual([]);
  });

  it("rejects a response without a results array", () => {
    for (const bad of [null, {}, { results: "nope" }, "text"]) {
      expect(() => parseTavilyResponse(bad, "web")).toThrow(/no results array/);
    }
  });
});
