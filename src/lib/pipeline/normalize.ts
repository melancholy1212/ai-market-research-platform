import { KNOWN_OUTLETS } from "@/lib/providers/rss-sites";
import { decodeEntities } from "@/lib/text";
import { displayHost } from "@/lib/url";

import type { MergedSource } from "./merge";

// Deterministic cleanup of collected sources before deduplication: titles,
// publisher names and dates arrive in inconsistent shapes from different
// providers, and some "sources" are really block pages.

// Titles that mean the page was never actually read.
const JUNK_TITLE =
  /^(access denied|403 forbidden|forbidden|404( not found)?|page not found|not found|just a moment\.*|attention required!?|are you a robot\??|security check|captcha|error|sign in|log in|login|subscribe to (read|continue))( [|\-–—·:].*)?$/i;

export function isJunkTitle(title: string): boolean {
  return JUNK_TITLE.test(title.trim());
}

// Letters and digits only, lowercased: "EU-Startups" -> "eustartups".
const squash = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

export function canonicalPublisher(url: string, publisher: string | null): string | null {
  const host = displayHost(url);
  if (host && KNOWN_OUTLETS.has(host)) return KNOWN_OUTLETS.get(host)!;
  if (publisher && !/^[\w.-]+\.[a-z]{2,}$/i.test(publisher)) return publisher.trim();
  return host;
}

const LEADING_SYMBOLS = /^[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Emoji_Component}‍️\s|·•:–—-]+/u;
// A separator with spaces on both sides; "EU-Startups" contains a hyphen but
// is not split.
const SUFFIX_SEPARATOR = /\s+[|\-–—·:]\s+/g;
const TRUNCATION = /\s*(\.\.\.|…)\s*$/;

// Strips a trailing " | Site Name" / " - Site Name" when the last segment
// names the publisher or the site's host ("... | Wellfound", "... - Wikipedia").
function stripSiteSuffix(title: string, publisher: string | null, url: string): string {
  const match = [...title.matchAll(SUFFIX_SEPARATOR)].at(-1);
  if (!match || match.index === undefined) return title;
  const head = title.slice(0, match.index);
  const tail = squash(title.slice(match.index + match[0].length));
  if (!tail || head.split(/\s+/).length < 3) return title;

  const host = displayHost(url) ?? "";
  // Each host label except the TLD: "en.wikipedia.org" -> ["en", "wikipedia"].
  const hostLabels = host.split(".").slice(0, -1).map(squash);
  const names = [squash(publisher ?? ""), squash(host), ...hostLabels].filter((n) => n.length >= 3);
  const namesSite = names.some((n) => tail === n || tail.startsWith(n) || n.startsWith(tail));
  return namesSite ? head : title;
}

export type CleanTitle = { title: string; truncated: boolean };

export function cleanTitle(raw: string, publisher: string | null, url: string): CleanTitle | null {
  let title = decodeEntities(raw).replace(/\s+/g, " ").trim();
  title = title.replace(LEADING_SYMBOLS, "").trim();
  title = stripSiteSuffix(title, publisher, url).trim();
  const truncated = TRUNCATION.test(title);
  if (truncated) title = title.replace(TRUNCATION, "").trim();
  return title ? { title, truncated } : null;
}

// Publication dates in the future or before the web existed are provider
// errors, not facts.
export function sanePublishedAt(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t) || t > now + 24 * 60 * 60 * 1000 || t < Date.UTC(1995, 0, 1)) return null;
  return iso;
}

export type NormalizedSource = MergedSource & { titleTruncated: boolean };

export type NormalizeStats = { junk: number };

export function normalizeSources(
  sources: MergedSource[],
  now = Date.now(),
): { sources: NormalizedSource[]; stats: NormalizeStats } {
  const stats: NormalizeStats = { junk: 0 };
  const out: NormalizedSource[] = [];

  for (const source of sources) {
    if (source.title && isJunkTitle(decodeEntities(source.title))) {
      stats.junk++;
      continue;
    }
    const publisher = canonicalPublisher(source.url, source.publisher);
    const cleaned = source.title ? cleanTitle(source.title, publisher, source.url) : null;
    out.push({
      ...source,
      title: cleaned?.title ?? null,
      titleTruncated: cleaned?.truncated ?? false,
      publisher,
      publishedAt: sanePublishedAt(source.publishedAt, now),
    });
  }
  return { sources: out, stats };
}
