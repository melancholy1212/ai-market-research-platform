import { XMLParser } from "fast-xml-parser";

import { ProviderError } from "@/lib/http";

export type RssItem = {
  title: string | null;
  link: string | null;
  publishedAt: string | null;
  description: string | null;
};

const parser = new XMLParser({
  ignoreAttributes: true,
  // Keep every value a string: a headline like "2026" must not become a number.
  parseTagValue: false,
  isArray: (tagName) => tagName === "item",
});

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  euro: "€", pound: "£", yen: "¥", cent: "¢", copy: "©", reg: "®", trade: "™", deg: "°",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

// Feed descriptions are HTML fragments. Reduce them to plain text and drop
// the "The post X appeared first on Y." footer WordPress appends.
export function htmlToText(html: string): string {
  const text = decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
  return text.replace(/\s*The post .{1,300}? appeared first on .{1,100}?\.?$/, "").trim();
}

const text = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = htmlToText(v);
  return t || null;
};

function isoDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// Parses an RSS 2.0 document. A missing <channel> means this is not a feed
// (e.g. an HTML error page), which is malformed; a channel with no items is
// simply an empty result.
export function parseRssFeed(xml: string, provider = "rss"): RssItem[] {
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    throw new ProviderError(provider, "malformed", "response was not valid XML");
  }
  const channel = (doc as { rss?: { channel?: unknown } } | null)?.rss?.channel;
  if (!channel || typeof channel !== "object") {
    throw new ProviderError(provider, "malformed", "response was not an RSS feed");
  }
  const items = (channel as { item?: unknown[] }).item ?? [];

  return items.flatMap((item): RssItem[] => {
    if (!item || typeof item !== "object") return [];
    const i = item as Record<string, unknown>;
    return [
      {
        title: text(i.title),
        link: typeof i.link === "string" ? i.link.trim() || null : null,
        publishedAt: isoDate(i.pubDate),
        description: text(i.description),
      },
    ];
  });
}
