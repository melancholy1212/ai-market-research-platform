// Turns a natural-language research question into a short keyword query for
// search engines that AND every term (site search, RSS search):
// "Research cybersecurity startups in Europe" -> "cybersecurity startups europe".

// Words that carry no topic: function words and research-request filler.
const STOPWORDS = new Set(
  (
    "a an and are as at be by for from has have in into is it its of on or that the this to was were will with " +
    "about across major main key recent latest new emerging current top best leading research identify find " +
    "analyze analyse overview list companies company developments trends trend market markets"
  ).split(" "),
);

// Keeps at most `maxTerms` terms, in order of appearance, since every extra
// ANDed term shrinks the result set.
export function searchKeywords(text: string, maxTerms = 3): string | null {
  const terms: string[] = [];
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}-]+/u)) {
    const term = raw.replace(/^-+|-+$/g, "");
    if (term.length < 3 || STOPWORDS.has(term) || terms.includes(term)) continue;
    terms.push(term);
    if (terms.length === maxTerms) break;
  }
  return terms.length ? terms.join(" ") : null;
}
