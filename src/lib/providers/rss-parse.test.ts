import { describe, expect, it } from "vitest";

import { decodeEntities } from "@/lib/text";

import { htmlToText, parseRssFeed } from "./rss-parse";

const feed = (items: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Site</title>${items}</channel></rss>`;

describe("parseRssFeed", () => {
  it("parses items, CDATA descriptions and dates", () => {
    const items = parseRssFeed(
      feed(`<item>
        <title>France&#8217;s Hackuity lands &#8364;16 million</title>
        <link>https://www.eu-startups.com/2026/09/hackuity/</link>
        <pubDate>Wed, 16 Sep 2026 10:30:00 +0000</pubDate>
        <description><![CDATA[<p>Paris-based <b>Hackuity</b> raised &euro;16M&hellip;</p>
          <p>The post Hackuity raises appeared first on EU-Startups.</p>]]></description>
      </item>`),
    );
    expect(items).toEqual([
      {
        title: "France’s Hackuity lands €16 million",
        link: "https://www.eu-startups.com/2026/09/hackuity/",
        publishedAt: "2026-09-16T10:30:00.000Z",
        description: "Paris-based Hackuity raised €16M…",
      },
    ]);
  });

  it("returns a single item as an array and keeps numeric-looking titles as text", () => {
    const [item] = parseRssFeed(feed("<item><title>2026</title><link>https://a.test/x</link></item>"));
    expect(item.title).toBe("2026");
  });

  it("treats a channel without items as an empty result", () => {
    expect(parseRssFeed(feed(""))).toEqual([]);
  });

  it("tolerates missing fields and bad dates", () => {
    const [item] = parseRssFeed(feed("<item><title>Only a title</title><pubDate>soon</pubDate></item>"));
    expect(item).toEqual({ title: "Only a title", link: null, publishedAt: null, description: null });
  });

  it("rejects HTML pages and non-feed XML as malformed", () => {
    expect(() => parseRssFeed("<!DOCTYPE html><html><body>Blocked</body></html>")).toThrow(/not an RSS feed/);
    expect(() => parseRssFeed("<feed><entry/></feed>")).toThrow(/not an RSS feed/);
    expect(() => parseRssFeed("")).toThrow();
  });
});

describe("decodeEntities / htmlToText", () => {
  it("decodes numeric and common named entities, leaving unknown ones", () => {
    expect(decodeEntities("&#8220;A&#x2019;s&#8221; &amp; &mdash; &bogus;")).toBe("“A’s” & — &bogus;");
  });

  it("strips tags, scripts and the WordPress footer", () => {
    expect(
      htmlToText(`<script>x()</script><p>Hello <a href="#">world</a></p> The post Hello appeared first on Site.`),
    ).toBe("Hello world");
  });
});
