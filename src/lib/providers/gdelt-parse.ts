import { ProviderError } from "@/lib/http";

import type { SourceCandidate } from "./types";

// Words that add nothing to a GDELT keyword search. GDELT ANDs every term
// and rejects very short or very common ones, so they have to go.
const STOPWORDS = new Set(
  (
    "a an and are as at be by for from has have in into is it its of on or that the this to was were will with " +
    "about across major main key recent latest new emerging current top best leading research identify find " +
    "analyze analyse overview list companies company developments trends trend market markets"
  ).split(" "),
);

// Turns a natural-language question into a GDELT keyword query:
// "Research cybersecurity startups in Europe" -> "cybersecurity startups europe".
// Keeps at most `maxTerms` terms, since every extra ANDed term shrinks results.
export function gdeltKeywords(text: string, maxTerms = 3): string | null {
  const terms: string[] = [];
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}-]+/u)) {
    const term = raw.replace(/^-+|-+$/g, "");
    if (term.length < 3 || STOPWORDS.has(term) || terms.includes(term)) continue;
    terms.push(term);
    if (terms.length === maxTerms) break;
  }
  return terms.length ? terms.join(" ") : null;
}

// GDELT's seendate looks like "20260923T141500Z".
export function parseSeenDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  // Date.UTC rolls impossible values over (month 13 -> next January), so
  // round-trip to reject them.
  const iso = date.toISOString();
  return iso.startsWith(`${y}-${mo}-${d}T${h}:${mi}:${s}`) ? iso : null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

// GDELT returns `{}` when nothing matched, so a missing articles array on an
// object is "no results", not an error.
export function parseGdeltResponse(response: unknown): SourceCandidate[] {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new ProviderError("gdelt", "malformed", "response was not a JSON object");
  }
  const articles = (response as { articles?: unknown }).articles;
  if (articles === undefined) return [];
  if (!Array.isArray(articles)) throw new ProviderError("gdelt", "malformed", "articles was not an array");

  return articles.flatMap((a): SourceCandidate[] => {
    const url = str(a?.url);
    if (!url) return [];
    return [
      {
        url,
        title: str(a.title),
        publisher: str(a.domain),
        publishedAt: parseSeenDate(a.seendate),
        snippet: null,
        type: "news",
        score: null,
      },
    ];
  });
}
