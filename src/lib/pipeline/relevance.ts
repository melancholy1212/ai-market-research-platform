import { findPlaces, mentionsPhrase, normCountry, placePhrases, REGIONS } from "@/lib/geo";
import { OUTLET_REGIONS } from "@/lib/providers/rss-sites";
import { displayHost } from "@/lib/url";

// Deterministic relevance scoring of collected sources against the research
// question, before any AI sees them. Keyword search (especially the news
// sites' full-text search) returns articles that merely mention a query word
// somewhere; this keeps the ones whose title, snippet or URL are actually
// about the question's topic and place. It is explainable on purpose: every
// score comes with the reasons behind it.

export type RelevanceInput = {
  title: string | null;
  snippet: string | null;
  url: string;
  publishedAt: string | null;
  foundByCount: number;
};

// How strongly an outlet's home region counts as place evidence.
const OUTLET_PLACE_SCORE = 0.6;

export type Relevance = { score: number; relevant: boolean; reasons: string[] };

// Words that describe the kind of answer wanted, not the topic.
const NON_TOPIC = new Set(
  (
    "a an and are as at be by for from has have how in into is it its of on or that the this to was were what when where which who why will with " +
    "about across major main key recent latest new emerging current top best leading research identify find analyze analyse overview list " +
    "company companies startup startups firm firms business businesses market markets industry industries sector sectors landscape player players " +
    "ecosystem trend trends development developments news update updates funding round rounds investment investments investor investors " +
    "raise raised raising"
  ).split(" "),
);
// Topic acronyms short enough to be dropped by length rules.
const ACRONYMS = new Set(["ai", "ml", "ev", "vr", "ar", "xr", "5g", "6g", "3d", "iot", "b2b", "b2c", "saas", "llm", "api", "hr", "rpa", "nft"]);

const stem = (w: string) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

function topicTerms(text: string, placeWords: Set<string>): string[] {
  const terms: string[] = [];
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}-]+/u)) {
    const w = raw.replace(/^-+|-+$/g, "");
    if (!w || NON_TOPIC.has(w) || placeWords.has(w)) continue;
    if (w.length < 3 && !ACRONYMS.has(w)) continue;
    if (!terms.includes(stem(w))) terms.push(stem(w));
  }
  return terms;
}

// Compound words match their parts: "cybersecurity" is covered by
// "cyber security" and "cyber-security".
const COMPOUNDS: Record<string, string[]> = {
  cybersecurity: ["cyber security", "cyber-security", "infosec", "cyber"],
  fintech: ["fin-tech", "financial technology", "payments", "neobank", "lending"],
  healthtech: ["health tech", "health-tech", "digital health"],
  edtech: ["ed-tech", "education technology"],
  proptech: ["prop-tech", "real estate tech"],
  insurtech: ["insurance tech", "insur-tech"],
  cleantech: ["clean tech", "climate tech", "climatetech"],
  ai: ["artificial intelligence", "a.i.", "genai", "generative ai", "machine learning", "llm"],
  robotic: ["robot", "robots", "robotics", "humanoid"],
};

function textMentionsTerm(text: string, term: string): boolean {
  const variants = [term, `${term}s`, ...(COMPOUNDS[term] ?? [])];
  return variants.some((v) => (ACRONYMS.has(v) ? mentionsPhrase(text, v) || mentionsPhrase(text, v.toUpperCase()) : mentionsPhrase(text, v)));
}

// Pages that answer a different question even when they mention the topic:
// job listings and similar. Phrased as listings, so an article *about* jobs
// ("the robot isn't coming for your job") is not caught.
const OFF_PURPOSE = [
  {
    pattern: /\b(jobs? (in|at|for)|job openings|open roles|(now|we'?re|actively) hiring|hiring (in|now)|to work for|best places to work|careers at|vacanc(y|ies)|salar(y|ies) (in|at|for))\b|&\s*hiring\b/i,
    reason: "job listing",
  },
  { pattern: /^(log ?in|sign ?in|sign ?up)\b|\b(coupon|promo code)s?\b/i, reason: "not an article" },
];
const JOB_HOSTS = new Set(["naukri.com", "indeed.com", "glassdoor.com", "monster.com", "ambitionbox.com", "workinstartups.com"]);

// Job listings and similar non-article pages, detected from the title or
// hosting site. Exported so callers can enforce it as a hard rule after AI
// classification: whatever label the AI gives, a job board is never a
// useful source for a market-research question.
export function offPurposeReason(title: string | null, url: string): string | null {
  const host = displayHost(url) ?? "";
  const match = OFF_PURPOSE.find((o) => o.pattern.test(title ?? "")) ?? (JOB_HOSTS.has(host) ? { reason: "job listing" } : null);
  return match?.reason ?? null;
}

// Display forms for reasons: "Germany", "United States", "AI".
const displayPlace = (p: string) => p.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
const displayTerm = (t: string) => (ACRONYMS.has(t) ? t.toUpperCase() : t);

export type RelevanceContext = {
  topic: string[];
  focusTopic: string[];
  places: string[]; // phrases for the question's place(s), empty if none
  placeNames: string[];
};

export function relevanceContext(research: { query: string; focus: string | null }): RelevanceContext {
  const places = findPlaces(`${research.query} ${research.focus ?? ""}`);
  const placeWords = new Set(
    places.flatMap((p) => [p, ...placePhrases(p), ...(REGIONS[p]?.words ?? [])]).flatMap((p) => p.split(/\s+/)),
  );
  const topic = topicTerms(research.query, placeWords);
  const focusTopic = topicTerms(research.focus ?? "", placeWords).filter((t) => !topic.includes(t));
  return { topic, focusTopic, places: [...new Set(places.flatMap(placePhrases))], placeNames: places };
}

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
export const RELEVANCE_THRESHOLD = 0.45;

// Score in [0, 1]. Title matches count fully, snippet matches 0.6, URL path
// matches 0.4. Topic carries most of the weight; the question's place, when
// it has one, the rest.
export function scoreRelevance(source: RelevanceInput, ctx: RelevanceContext, now = Date.now()): Relevance {
  const title = source.title ?? "";
  const snippet = source.snippet ?? "";
  let path = "";
  try {
    path = decodeURIComponent(new URL(source.url).pathname).replace(/[-_/]+/g, " ");
  } catch {
    /* unparseable URLs were dropped earlier */
  }
  const reasons: string[] = [];

  const fieldScore = (match: (text: string) => boolean): number =>
    match(title) ? 1 : match(snippet) ? 0.6 : match(path) ? 0.4 : 0;

  const topicScores = ctx.topic.map((t) => fieldScore((text) => textMentionsTerm(text, t)));
  const focusScores = ctx.focusTopic.map((t) => fieldScore((text) => textMentionsTerm(text, t)));
  const topic = topicScores.length
    ? topicScores.reduce((a, b) => a + b, 0) / topicScores.length
    : 1;
  const focus = focusScores.length ? Math.max(...focusScores) : 0;
  const host = displayHost(source.url) ?? "";
  const outletRegion = OUTLET_REGIONS.get(host);
  const outletPlace =
    outletRegion && ctx.placeNames.some((p) => {
      const q = normCountry(p);
      // Same place, or the outlet's region contains the question's country.
      return q === outletRegion || (REGIONS[outletRegion]?.countries.includes(q) ?? false);
    })
      ? OUTLET_PLACE_SCORE
      : 0;
  const place = ctx.places.length
    ? Math.max(fieldScore((text) => ctx.places.some((p) => mentionsPhrase(text, p))), outletPlace)
    : 1;

  const missingTopic = ctx.topic.filter((_, i) => topicScores[i] === 0);
  if (missingTopic.length) reasons.push(`does not mention ${missingTopic.map(displayTerm).join(", ")}`);
  if (ctx.places.length && place === 0) reasons.push(`not about ${ctx.placeNames.map(displayPlace).join(", ")}`);

  let score = ctx.places.length ? 0.65 * topic + 0.35 * place : topic;
  score += 0.1 * focus;
  if (source.foundByCount >= 2) {
    score += 0.1;
    reasons.push(`found by ${source.foundByCount} searches`);
  }

  const offPurposeReasonText = offPurposeReason(title, source.url);
  if (offPurposeReasonText) reasons.push(offPurposeReasonText);

  if (source.publishedAt) {
    const age = (now - Date.parse(source.publishedAt)) / YEAR_MS;
    if (age > 5) {
      score -= 0.3;
      reasons.push(`published ${Math.floor(age)} years ago`);
    } else if (age > 2) {
      score -= 0.15;
      reasons.push(`published ${Math.floor(age)} years ago`);
    }
  }

  score = Math.max(0, Math.min(1, score));
  // Hard limits, applied after every bonus:
  // a question about a place needs sources about that place, so a strong
  // topic match elsewhere ("China's humanoid robot industry" for Japan)
  // fails; and off-purpose pages are never relevant.
  if (ctx.places.length && place === 0) score = Math.min(score, RELEVANCE_THRESHOLD - 0.05);
  if (offPurposeReasonText) score = Math.min(score, 0.2);
  return { score: Math.round(score * 100) / 100, relevant: score >= RELEVANCE_THRESHOLD, reasons };
}

export type StoryRelevance = {
  score: number; // best score among the story's sources
  relevant: boolean;
  promoted: boolean; // kept below the threshold to cover the question
  members: Relevance[]; // [primary, ...duplicates]
};

// Never send fewer than this many stories to analysis when enough sources
// have at least some bearing on the question.
export const MIN_RELEVANT_STORIES = 15;
const PROMOTION_FLOOR = 0.25;

// Story-level decisions: a story is as relevant as its best source (a
// syndicated copy with a clearer headline can carry it). If too few stories
// pass, the best remaining ones with some topical match are promoted, so a
// narrow question is not filtered down to nothing.
export function judgeStories(stories: RelevanceInput[][], ctx: RelevanceContext, now = Date.now()): StoryRelevance[] {
  const judged = stories.map((members) => {
    const scored = members.map((m) => scoreRelevance(m, ctx, now));
    const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
    return { score: best.score, relevant: best.relevant, promoted: false, members: scored };
  });

  let relevantCount = judged.filter((j) => j.relevant).length;
  const candidates = judged
    .filter((j) => !j.relevant && j.score >= PROMOTION_FLOOR && !j.members.some((m) => m.reasons.includes("job listing")))
    .sort((a, b) => b.score - a.score);
  for (const j of candidates) {
    if (relevantCount >= MIN_RELEVANT_STORIES) break;
    j.relevant = true;
    j.promoted = true;
    relevantCount++;
  }
  return judged;
}

// "12 not about germany, 9 do not mention ai, 2 job listings" for the log.
export function summarizeReasons(judged: StoryRelevance[]): string {
  const counts = new Map<string, number>();
  for (const j of judged.filter((x) => !x.relevant)) {
    const primary = j.members[0];
    const reason = primary.reasons.find((r) => r === "job listing" || r === "not an article") ??
      primary.reasons.find((r) => r.startsWith("not about")) ??
      primary.reasons.find((r) => r.startsWith("does not mention")) ??
      primary.reasons.find((r) => r.startsWith("published")) ??
      "weak match";
    // Counted phrasing: "5 not about AI", not "5 does not mention AI".
    const key = reason.startsWith("published")
      ? "too old"
      : reason.startsWith("does not mention")
        ? reason.replace("does not mention", "not about")
        : reason;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => `${n} ${n > 1 && reason === "job listing" ? "job listings" : reason}`)
    .join(", ");
}
