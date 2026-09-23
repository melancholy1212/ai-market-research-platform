import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isBlockedPage, parseResultUrls, pickOfficialDomain } from "./ddg-parse";

// A real block page DuckDuckGo served this project's VM after ~3 requests.
const anomaly = readFileSync(new URL("./__fixtures__/ddg-anomaly.html", import.meta.url), "utf8");

// Result markup as served by html.duckduckgo.com (trimmed).
const results = `
  <div class="result results_links results_links_deep result--ad">
    <a rel="nofollow" class="result__a" href="https://duckduckgo.com/y.js?ad_domain=x.com&amp;u3=1">Ad</a></div>
  <div class="result results_links results_links_deep web-result">
    <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FCred_(company)&amp;rut=abc">Cred (company) - Wikipedia</a></div>
  <div class="result results_links results_links_deep web-result">
    <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.linkedin.com%2Fcompany%2Fcred-club&amp;rut=def">CRED | LinkedIn</a></div>
  <div class="result results_links results_links_deep web-result">
    <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fcred.club%2F&amp;rut=ghi">CRED - members only</a></div>`;

describe("isBlockedPage", () => {
  it("recognizes the anomaly page and HTTP 202", () => {
    expect(isBlockedPage(202, "")).toBe(true);
    expect(isBlockedPage(200, anomaly)).toBe(true);
    expect(isBlockedPage(200, results)).toBe(false);
  });
});

describe("parseResultUrls", () => {
  it("decodes redirect links and drops ads", () => {
    expect(parseResultUrls(results)).toEqual([
      "https://en.wikipedia.org/wiki/Cred_(company)",
      "https://www.linkedin.com/company/cred-club",
      "https://cred.club/",
    ]);
  });
  it("finds nothing in a block page", () => {
    expect(parseResultUrls(anomaly)).toEqual([]);
  });
});

describe("pickOfficialDomain", () => {
  it("skips aggregators and returns the domain that matches the name", () => {
    expect(pickOfficialDomain(parseResultUrls(results), "CRED")).toBe("cred.club");
  });
  it("returns nothing rather than guessing", () => {
    expect(pickOfficialDomain(["https://en.wikipedia.org/wiki/X", "https://some-blog.com/cred-review"], "CRED")).toBeNull();
  });
});
