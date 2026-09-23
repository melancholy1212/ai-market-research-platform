// Fuzzy deduplication: finds sources that report the same story under
// different URLs (another outlet, a syndicated copy, a tracking-free vs AMP
// link that normalization could not unify).
//
// Deterministic and tuned for precision. Merging two different stories hides
// evidence, which is worse than missing a duplicate. Headline rewrites of the
// same story ("Meta to invest $900M in CRED" vs "How a $4B Indian startup won
// Meta's backing") are out of reach for title matching; that is left to the
// AI stages.

const STOPWORDS = new Set(
  (
    "a an and are as at be by for from has have how in into is it its of on or that the this to was were what " +
    "when where which who why will with after about over new says said"
  ).split(" "),
);

// Title -> comparable tokens. Diacritics and case are dropped, money amounts
// are unified ("€16 million" and "€16M" both become "16m"), and plural "s"
// is stripped from longer words.
export function titleTokens(title: string): Set<string> {
  const text = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:million|mn|mln|m)\b/g, (_, n: string) => ` ${n.replace(",", ".")}m `)
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:billion|bn|b)\b/g, (_, n: string) => ` ${n.replace(",", ".")}b `)
    .replace(/(\d)[.,](?=\d{3}\b)/g, "$1");

  const tokens = new Set<string>();
  for (const raw of text.split(/[^\p{L}\p{N}.]+/u)) {
    let token = raw.replace(/^\.+|\.+$/g, "");
    if (!token || STOPWORDS.has(token)) continue;
    if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss")) token = token.slice(0, -1);
    tokens.add(token);
  }
  return tokens;
}

// Words that appear across unrelated funding/business headlines, so sharing
// them says nothing about being the same story.
const GENERIC = new Set(
  (
    "startup company companie firm raise raised raising secure secures land lands bag bags close closes " +
    "funding fundraise fundraising round seed series pre-seed valuation valued unicorn statu become becomes hit " +
    "hits announce announces launch launches investment investor invest back backed led lead million billion " +
    "report news update week weekly daily today year first"
  ).split(" "),
);
const MONEY = /^\d+(?:\.\d+)?[mb]$/;
const MAX_FIGURE_GAP_MS = 3 * 24 * 60 * 60 * 1000;

export type DedupCandidate = {
  title: string | null;
  publishedAt: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DATE_GAP_MS = 4 * DAY_MS;
// Minimum distinctive tokens two titles must share to be compared at all.
const MIN_SHARED_TOKENS = 3;

export type Match = { similarity: number; reason: "similar_title" | "same_title" | "same_figure" };

// Compares two titles after removing the research question's own words,
// which every result shares and which therefore say nothing about identity.
export function matchStories(
  a: DedupCandidate,
  b: DedupCandidate,
  ignore: ReadonlySet<string> = new Set(),
): Match | null {
  if (!a.title || !b.title) return null;

  const allA = titleTokens(a.title);
  const allB = titleTokens(b.title);

  const ad = a.publishedAt ? Date.parse(a.publishedAt) : NaN;
  const bd = b.publishedAt ? Date.parse(b.publishedAt) : NaN;
  const bothDated = !Number.isNaN(ad) && !Number.isNaN(bd);
  const gap = bothDated ? Math.abs(ad - bd) : Infinity;

  // Recurring formats ("Weekly funding round-up", daily newsletters) reuse
  // the same title for different editions: dates settle it.
  if (bothDated && gap > MAX_DATE_GAP_MS) return null;

  const ta = [...allA].filter((t) => !ignore.has(t));
  const tb = new Set([...allB].filter((t) => !ignore.has(t)));
  const shared = ta.filter((t) => tb.has(t)).length;
  const jaccard = shared / (new Set([...ta, ...tb]).size || 1);
  const containment = shared / (Math.min(ta.length, tb.size) || 1);

  if (shared >= MIN_SHARED_TOKENS && jaccard >= 0.9) return { similarity: round(jaccard), reason: "same_title" };

  // Rewritten headlines about one event rarely share many words, but they
  // do share its figure and its subject: "Exein raises $270 Million" and
  // "Italy's Exein hits unicorn status with $270m". The figure alone is not
  // enough (two different startups can each raise $10M the same week), so
  // at least one non-generic word must be shared too. Question words count
  // here: when the question names the company, the name is the subject.
  if (gap <= MAX_FIGURE_GAP_MS) {
    const sharedAll = [...allA].filter((t) => allB.has(t));
    const figures = sharedAll.filter((t) => MONEY.test(t));
    const subjects = sharedAll.filter((t) => !MONEY.test(t) && !GENERIC.has(t) && !/^\d+$/.test(t));
    if (figures.length > 0 && subjects.length > 0) return { similarity: 1, reason: "same_figure" };
  }

  // Without both dates, only near-identical titles count: similar listicles
  // ("Top 10 cybersecurity companies in Europe") are different pages.
  if (!bothDated || shared < MIN_SHARED_TOKENS) return null;

  const similarity = Math.max(jaccard, containment * 0.85);
  return similarity >= 0.7 ? { similarity: round(similarity), reason: "similar_title" } : null;
}

const round = (n: number) => Math.round(n * 100) / 100;

export type StoryGroup<T> = {
  primary: T;
  duplicates: { source: T; match: Match }[];
};

// Groups sources into stories. Sources are considered in the given order and
// the first of each group becomes its primary, so callers should pass the
// best source first.
//
// A source joins a group if it matches the group's primary. Title
// similarity is only checked against the primary, which prevents chains
// (A~B, B~C) from merging unrelated A and C. The shared-figure rule is strong
// enough to also match any member: "$270M" and "$1.7B valuation" headlines
// about one round are bridged by a headline that states both.
export function groupStories<T extends DedupCandidate>(
  sources: readonly T[],
  ignore: ReadonlySet<string> = new Set(),
): StoryGroup<T>[] {
  const groups: StoryGroup<T>[] = [];
  for (const source of sources) {
    let joined = false;
    for (const group of groups) {
      let match = matchStories(group.primary, source, ignore);
      if (!match) {
        for (const member of group.duplicates) {
          const viaMember = matchStories(member.source, source, ignore);
          if (viaMember?.reason === "same_figure") {
            match = viaMember;
            break;
          }
        }
      }
      if (match) {
        group.duplicates.push({ source, match });
        joined = true;
        break;
      }
    }
    if (!joined) groups.push({ primary: source, duplicates: [] });
  }
  return groups;
}
