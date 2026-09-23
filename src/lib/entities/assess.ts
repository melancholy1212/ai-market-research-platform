import { mentionsPhrase, normCountry, placePhrases } from "@/lib/geo";
import { registrableDomain } from "./domain";

// Evidence-based judgements about extracted companies: what kind of
// organization each one is, how confident we can be that it is a real,
// correctly identified organization, and how to order them for a question.

export const ENTITY_TYPES = ["startup", "established_company", "investor", "partner", "research_institution", "other"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  startup: "Startup",
  established_company: "Established company",
  investor: "Investor",
  partner: "Partner",
  research_institution: "Research institution",
  other: "Other",
};

// Companies older than this, or publicly listed, are not startups however
// the sources phrase it.
const STARTUP_MAX_AGE_YEARS = 15;
const PUBLIC_COMPANY = "Q891723";

export type TypeDecision = { type: EntityType; evidence: string | null };

// The AI proposes a type from the source text; structured Wikidata facts can
// overrule a "startup" claim, never the other way round.
export function reconcileEntityType(
  proposed: EntityType,
  aiEvidence: string | null,
  wikidata: { inceptionYear: number | null; instanceOf: string[] } | null,
  now = new Date(),
): TypeDecision {
  if (proposed === "startup" && wikidata) {
    if (wikidata.instanceOf.includes(PUBLIC_COMPANY)) {
      return { type: "established_company", evidence: "publicly listed company (Wikidata)" };
    }
    if (wikidata.inceptionYear && now.getUTCFullYear() - wikidata.inceptionYear > STARTUP_MAX_AGE_YEARS) {
      return { type: "established_company", evidence: `founded ${wikidata.inceptionYear} (Wikidata)` };
    }
  }
  return { type: proposed, evidence: aiEvidence };
}

// ---------------------------------------------------------------------------
// Verification confidence
// ---------------------------------------------------------------------------

// Outlets with editorial standards whose coverage counts as evidence that a
// company is real and doing what the report says.
const REPUTABLE_OUTLETS = new Set([
  "reuters.com", "bloomberg.com", "ft.com", "wsj.com", "nytimes.com", "economist.com", "cnbc.com", "fortune.com",
  "forbes.com", "techcrunch.com", "theinformation.com", "apnews.com", "bbc.com", "bbc.co.uk", "theguardian.com",
  "wired.com", "theverge.com", "axios.com", "businessinsider.com", "venturebeat.com", "euronews.com", "nikkei.com",
  "japantimes.co.jp", "handelsblatt.com", "lesechos.fr", "sifted.eu", "tech.eu", "eu-startups.com", "crunchbase.com",
  "inc42.com", "yourstory.com", "indiatimes.com", "techcabal.com", "startupdaily.net", "siliconrepublic.com",
  "securityweek.com", "restofworld.org", "fastcompany.com",
]);
// Press-release wires prove the company exists, not that others covered it.
const WIRES = new Set(["globenewswire.com", "prnewswire.com", "businesswire.com"]);

export type Confidence = "high" | "medium" | "low";

export type VerificationInput = {
  wikidataMatch: boolean;
  websiteSource: "sources" | "wikidata" | "clearbit" | "search" | null;
  citedSourceUrls: string[]; // URLs of the sources that mention the company
  country: string | null; // from the sources
  wikidataCountry: string | null;
  domain: string | null;
};

export type Verification = { confidence: Confidence; signals: string[] };

const CCTLD_COUNTRY: Record<string, string> = {
  in: "india", de: "germany", jp: "japan", uk: "united kingdom", fr: "france", it: "italy", es: "spain", nl: "netherlands",
  se: "sweden", dk: "denmark", fi: "finland", no: "norway", ch: "switzerland", at: "austria", be: "belgium", pl: "poland",
  ee: "estonia", pt: "portugal", ie: "ireland", il: "israel", ng: "nigeria", ke: "kenya", za: "south africa", eg: "egypt",
  br: "brazil", mx: "mexico", ca: "canada", au: "australia", sg: "singapore", kr: "south korea", cn: "china", ae: "united arab emirates",
};

// Multi-signal confidence. Wikidata is one signal among several: a startup
// with an official website and coverage from reputable outlets is well
// supported even if Wikidata has never heard of it.
export function assessVerification(input: VerificationInput): Verification {
  const signals: string[] = [];
  const outlets = [...new Set(input.citedSourceUrls.map((u) => registrableDomain(u)).filter((d): d is string => Boolean(d)))];
  const independent = outlets.filter((d) => d !== input.domain && !WIRES.has(d));
  const reputable = independent.filter((d) => REPUTABLE_OUTLETS.has(d) || [...REPUTABLE_OUTLETS].some((r) => d.endsWith(`.${r}`)));

  const officialWebsite = input.websiteSource === "sources" || input.websiteSource === "wikidata";
  const nameMatchedWebsite = input.websiteSource === "clearbit" || input.websiteSource === "search";
  if (officialWebsite) signals.push(`official website (${input.websiteSource === "sources" ? "from the sources" : "from Wikidata"})`);
  else if (nameMatchedWebsite) signals.push("website found by name match");
  if (reputable.length) signals.push(`covered by ${reputable.slice(0, 3).join(", ")}`);
  if (independent.length >= 2) signals.push(`${independent.length} independent sources`);
  if (input.wikidataMatch) signals.push("matched on Wikidata");

  const tld = input.domain?.split(".").at(-1);
  const tldCountry = tld && tld.length === 2 ? CCTLD_COUNTRY[tld] : undefined;
  const country = input.country ? normCountry(input.country) : null;
  const consistent =
    country && ((input.wikidataCountry && normCountry(input.wikidataCountry) === country) || (tldCountry && tldCountry === country));
  if (consistent) signals.push("country consistent across evidence");

  const hasWebsite = officialWebsite || nameMatchedWebsite;
  const confidence: Confidence =
    (hasWebsite && reputable.length > 0) || independent.length >= 3 || (input.wikidataMatch && (hasWebsite || independent.length >= 2))
      ? "high"
      : hasWebsite || reputable.length > 0 || independent.length >= 2 || input.wikidataMatch
        ? "medium"
        : "low";
  if (confidence === "low") signals.push("single, weak source");
  return { confidence, signals };
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

export type RankableCompany = {
  entityType: EntityType | null;
  country: string | null;
  focus: string | null;
  name: string;
  confidence: Confidence | null;
  citationCount: number;
};

export type RankingConstraints = { entityType: string; geography: string[]; topic: string };

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

function inGeography(country: string | null, geography: string[]): 0 | 1 | 2 {
  if (geography.length === 0) return 0;
  if (!country) return 1;
  const c = normCountry(country);
  return geography.some((g) => placePhrases(g).includes(c) || normCountry(g) === c) ? 0 : 2;
}

// Word stem for matching variants: robotics/robotic/robots -> "robot",
// payments -> "payment", security -> "security".
function stem(word: string): string {
  const w = word.toLowerCase();
  for (const suffix of ["ics", "ic", "ing", "ed", "s"]) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 4) return w.slice(0, -suffix.length);
  }
  return w;
}

function aboutTopic(focus: string | null, topic: string): 0 | 1 {
  if (!topic.trim()) return 0;
  if (!focus) return 1;
  // Two-letter topics ("AI") count; mentionsPhrase matches those in capitals only.
  const words = topic.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2);
  if (words.length === 0) return 0;
  const focusWords = focus.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  return words.some((w) =>
    w.length <= 3 ? mentionsPhrase(focus, w) : focusWords.some((f) => f.startsWith(stem(w))),
  )
    ? 0
    : 1;
}

// Requested entity type first, then the requested geography, the topic,
// and stronger evidence. Stable for ties, so the analysis order breaks them.
export function rankCompanies<T extends RankableCompany>(companies: T[], constraints: RankingConstraints | null): T[] {
  const key = (c: T): number[] => [
    constraints && constraints.entityType !== "any" ? (c.entityType === constraints.entityType ? 0 : 1) : 0,
    constraints ? inGeography(c.country, constraints.geography) : 0,
    constraints ? aboutTopic(c.focus, constraints.topic) : 0,
    c.confidence ? CONFIDENCE_RANK[c.confidence] : 3,
    -c.citationCount,
  ];
  return companies
    .map((c, i) => ({ c, i, k: key(c) }))
    .sort((a, b) => {
      for (let j = 0; j < a.k.length; j++) if (a.k[j] !== b.k[j]) return a.k[j] - b.k[j];
      return a.i - b.i;
    })
    .map((x) => x.c);
}
