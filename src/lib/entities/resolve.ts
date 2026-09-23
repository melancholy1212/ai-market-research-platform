import { domainMatchesName, registrableDomain } from "./domain";

// Deterministic identity resolution of a company mentioned in the sources
// against Wikidata candidates. A name is not an identity: a candidate is
// accepted only when independent signals (country, website, description)
// agree, and a same-named organization elsewhere is rejected rather than
// merged. When in doubt the company stays unresolved.

export type WikidataEntity = {
  id: string;
  label: string | null;
  aliases: string[];
  description: string | null;
  instanceOf: string[];
  countryIds: string[];
  websites: string[];
};

type Claim = { mainsnak?: { datavalue?: { value?: unknown } }; rank?: string };

const claimValues = (claims: Record<string, Claim[]> | undefined, prop: string): unknown[] =>
  (claims?.[prop] ?? []).filter((c) => c.rank !== "deprecated").map((c) => c.mainsnak?.datavalue?.value);

// Parses a wbgetentities response into the fields resolution uses.
export function parseWikidataEntities(response: unknown): WikidataEntity[] {
  const entities = (response as { entities?: Record<string, unknown> } | null)?.entities ?? {};
  return Object.values(entities).flatMap((raw): WikidataEntity[] => {
    const e = raw as {
      id?: string;
      missing?: string;
      labels?: Record<string, { value: string }>;
      aliases?: Record<string, { value: string }[]>;
      descriptions?: Record<string, { value: string }>;
      claims?: Record<string, Claim[]>;
    };
    if (!e?.id || e.missing !== undefined) return [];
    const ids = (prop: string) =>
      claimValues(e.claims, prop).flatMap((v) => (v && typeof (v as { id?: unknown }).id === "string" ? [(v as { id: string }).id] : []));
    return [
      {
        id: e.id,
        label: e.labels?.en?.value ?? null,
        aliases: (e.aliases?.en ?? []).map((a) => a.value),
        description: e.descriptions?.en?.value ?? null,
        instanceOf: ids("P31"),
        countryIds: ids("P17"),
        websites: claimValues(e.claims, "P856").filter((v): v is string => typeof v === "string"),
      },
    ];
  });
}

const squash = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const CORPORATE = /\b(inc|ltd|limited|llc|gmbh|ag|sa|sas|srl|spa|plc|bv|nv|pvt|private|corp|corporation|company|group|holdings?)\b/g;
const nameKeys = (name: string) => {
  const plain = name.toLowerCase().replace(/\./g, "");
  return new Set([squash(plain), squash(plain.replace(CORPORATE, " "))].filter(Boolean));
};

// Wikidata classes that are organizations. Candidates come from a search
// already filtered to these; the check here guards against stale data.
const ORG_CLASSES = new Set([
  "Q4830453", "Q783794", "Q6881511", "Q891723", "Q1589009", "Q18388277", "Q1058914", "Q43229", "Q22687",
  "Q650241", "Q658255", "Q20074337", "Q167037", "Q2085381", "Q17127659",
]);
const ORG_WORDS = /\b(company|startup|firm|provider|platform|bank|business|enterprise|fintech|manufacturer|developer|organi[sz]ation|corporation|conglomerate)\b/i;

// Demonyms for countries this app commonly sees, so a description such as
// "Indian financial services company" counts as country evidence.
const DEMONYMS: Record<string, string[]> = {
  india: ["indian"], "united kingdom": ["british", "uk", "english", "scottish"], "united states": ["american", "us", "u.s."],
  germany: ["german"], france: ["french"], italy: ["italian"], spain: ["spanish"], netherlands: ["dutch"],
  sweden: ["swedish"], denmark: ["danish"], norway: ["norwegian"], finland: ["finnish"], ireland: ["irish"],
  israel: ["israeli"], switzerland: ["swiss"], austria: ["austrian"], belgium: ["belgian"], poland: ["polish"],
  estonia: ["estonian"], portugal: ["portuguese"], nigeria: ["nigerian"], kenya: ["kenyan"], "south africa": ["south african"],
  egypt: ["egyptian"], brazil: ["brazilian"], mexico: ["mexican"], canada: ["canadian"], australia: ["australian"],
  singapore: ["singaporean"], japan: ["japanese"], china: ["chinese"], "south korea": ["korean", "south korean"],
  indonesia: ["indonesian"], "united arab emirates": ["emirati", "uae"], "saudi arabia": ["saudi"], hungary: ["hungarian"],
  "czech republic": ["czech"], czechia: ["czech"], slovakia: ["slovak"], romania: ["romanian"], ukraine: ["ukrainian"],
};
const COUNTRY_ALIASES: Record<string, string> = {
  usa: "united states", us: "united states", "united states of america": "united states", uk: "united kingdom",
  "great britain": "united kingdom", england: "united kingdom", uae: "united arab emirates", korea: "south korea",
};
const normCountry = (c: string) => {
  const k = c.toLowerCase().replace(/^the /, "").replace(/\./g, "").trim();
  return COUNTRY_ALIASES[k] ?? k;
};

export type CompanyToResolve = {
  name: string;
  country: string | null; // from the sources (AI-extracted)
  focus: string | null;
  domain: string | null; // from the sources, already validated
};

export type CandidateMatch = {
  entity: WikidataEntity;
  score: number;
  signals: string[];
};

export type Resolution =
  | { status: "resolved"; match: CandidateMatch; confidence: number }
  | { status: "ambiguous"; candidates: CandidateMatch[] }
  | { status: "unresolved"; reason: string };

const CONTEXT_STOP = new Set("the and for with company companies startup startups platform based services service provider in of".split(" "));
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !CONTEXT_STOP.has(w)));

export function scoreCandidate(
  company: CompanyToResolve,
  entity: WikidataEntity,
  countryLabels: ReadonlyMap<string, string>,
  context: string,
): CandidateMatch | { rejected: string } {
  const keys = nameKeys(company.name);
  const names = [entity.label, ...entity.aliases].filter((n): n is string => Boolean(n));
  if (!names.some((n) => [...nameKeys(n)].some((k) => keys.has(k)))) return { rejected: "name differs" };

  const description = entity.description ?? "";
  const isOrg = entity.instanceOf.some((c) => ORG_CLASSES.has(c)) || ORG_WORDS.test(description);
  if (!isOrg) return { rejected: "not an organization" };

  let score = 1;
  const signals = ["organization"];

  // Country: a known mismatch is disqualifying (XFlow in Denmark is not
  // Xflow in India).
  const entityCountries = entity.countryIds.map((id) => countryLabels.get(id)).filter((c): c is string => Boolean(c)).map(normCountry);
  const descWords = description.toLowerCase();
  if (company.country) {
    const wanted = normCountry(company.country);
    const demonyms = DEMONYMS[wanted] ?? [];
    const inDescription = demonyms.some((d) => new RegExp(`(^|[^a-z])${d.replace(".", "\\.")}([^a-z]|$)`).test(descWords));
    if (entityCountries.includes(wanted) || inDescription) {
      score += 2;
      signals.push("country matches");
    } else if (entityCountries.length > 0) {
      return { rejected: `country differs (${entityCountries.join(", ")})` };
    }
  }

  // Website: agreement with a domain seen in the sources is the strongest
  // evidence; a different official domain counts against.
  const entityDomains = entity.websites.map(registrableDomain).filter((d): d is string => Boolean(d));
  if (company.domain && entityDomains.length) {
    if (entityDomains.includes(registrableDomain(company.domain) ?? "")) {
      score += 4;
      signals.push("website matches sources");
    } else {
      score -= 3;
      signals.push("website differs from sources");
    }
  } else if (entityDomains.some((d) => domainMatchesName(d, company.name))) {
    score += 1;
    signals.push("website matches name");
  }

  // Description relevant to the research (sector words, or the country the
  // question is about).
  const contextWords = words(`${context} ${company.focus ?? ""}`);
  const overlap = [...words(description)].filter((w) => contextWords.has(w));
  const contextCountryHit = Object.entries(DEMONYMS).some(
    ([country, demonyms]) => contextWords.has(country) && demonyms.some((d) => descWords.includes(d)),
  );
  if (overlap.length || (!company.country && contextCountryHit)) {
    score += 1;
    signals.push("description fits the research");
  }

  return { entity, score, signals };
}

const ACCEPT_SCORE = 3;
const MIN_LEAD = 2;

export function resolveCompany(
  company: CompanyToResolve,
  candidates: WikidataEntity[],
  countryLabels: ReadonlyMap<string, string>,
  context: string,
): Resolution {
  if (candidates.length === 0) return { status: "unresolved", reason: "no Wikidata candidates" };
  const scored = candidates
    .map((c) => scoreCandidate(company, c, countryLabels, context))
    .filter((m): m is CandidateMatch => "entity" in m)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return { status: "unresolved", reason: "no candidate matched" };

  const [best, second] = scored;
  if (best.score < ACCEPT_SCORE) return { status: "unresolved", reason: "not enough evidence" };
  if (second && best.score - second.score < MIN_LEAD) return { status: "ambiguous", candidates: scored.slice(0, 3) };
  return { status: "resolved", match: best, confidence: Math.min(0.95, 0.5 + best.score * 0.08) };
}
