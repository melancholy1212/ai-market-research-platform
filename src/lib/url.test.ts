import { describe, expect, it } from "vitest";

import { displayHost, normalizeUrl } from "./url";

describe("normalizeUrl", () => {
  it("treats scheme, www, case of host, fragment and trailing slash as irrelevant", () => {
    const variants = [
      "https://example.com/news/article-1",
      "http://example.com/news/article-1",
      "https://www.example.com/news/article-1",
      "https://WWW.Example.COM/news/article-1/",
      "https://example.com/news/article-1#comments",
      "https://example.com:443/news/article-1",
    ];
    const normalized = new Set(variants.map(normalizeUrl));
    expect([...normalized]).toEqual(["https://example.com/news/article-1"]);
  });

  it("strips tracking parameters but keeps meaningful ones, in a stable order", () => {
    expect(
      normalizeUrl("https://example.com/a?utm_source=x&id=7&fbclid=abc&page=2&UTM_Medium=y"),
    ).toBe("https://example.com/a?id=7&page=2");
    expect(normalizeUrl("https://example.com/a?page=2&id=7")).toBe(
      normalizeUrl("https://example.com/a?id=7&page=2"),
    );
  });

  it("keeps path case, since paths can be case-sensitive", () => {
    expect(normalizeUrl("https://example.com/Report/Q3")).toBe("https://example.com/Report/Q3");
  });

  it("keeps non-default ports and different paths distinct", () => {
    expect(normalizeUrl("https://example.com:8443/a")).toBe("https://example.com:8443/a");
    expect(normalizeUrl("https://example.com/a")).not.toBe(normalizeUrl("https://example.com/b"));
  });

  it("rejects non-http(s) and malformed input", () => {
    for (const bad of ["", "not a url", "ftp://example.com/x", "javascript:alert(1)", "/relative/path"]) {
      expect(normalizeUrl(bad)).toBeNull();
    }
  });
});

describe("displayHost", () => {
  it("returns the host without www", () => {
    expect(displayHost("https://www.Reuters.com/tech/x")).toBe("reuters.com");
    expect(displayHost("nope")).toBeNull();
  });
});
