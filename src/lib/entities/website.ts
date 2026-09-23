import { domainMatchesName, registrableDomain } from "./domain";

// Choosing a company's official website from search or lookup results.

// Sites that are never a company's own website.
const NOT_OFFICIAL = new Set([
  "wikipedia.org", "wikidata.org", "linkedin.com", "crunchbase.com", "tracxn.com", "pitchbook.com", "cbinsights.com",
  "facebook.com", "instagram.com", "x.com", "twitter.com", "youtube.com", "tiktok.com", "reddit.com", "medium.com",
  "bloomberg.com", "reuters.com", "techcrunch.com", "forbes.com", "glassdoor.com", "indeed.com", "ambitionbox.com",
  "zaubacorp.com", "tofler.in", "dealroom.co", "f6s.com", "wellfound.com", "angel.co", "g2.com", "capterra.com",
  "apps.apple.com", "apple.com", "play.google.com", "google.com", "yahoo.com", "bing.com", "github.com",
  "eu-startups.com", "inc42.com", "yourstory.com", "economictimes.indiatimes.com", "indiatimes.com", "zoominfo.com",
  "owler.com", "craft.co", "rocketreach.co", "similarweb.com", "trustpilot.com",
]);

// First result whose domain plausibly belongs to the company. Aggregators
// and news sites are skipped; if no domain matches the name, there is no
// answer rather than a guess.
export function pickOfficialDomain(urls: string[], companyName: string): string | null {
  for (const url of urls) {
    const domain = registrableDomain(url);
    if (!domain || NOT_OFFICIAL.has(domain)) continue;
    if (domainMatchesName(domain, companyName)) return domain;
  }
  return null;
}

// Country-code TLDs by country, for rejecting a same-named company's site in
// another country (atira.in is not a German company's website).
const CCTLD: Record<string, string> = {
  india: "in", germany: "de", "united kingdom": "uk", "united states": "us", france: "fr", italy: "it", spain: "es",
  netherlands: "nl", sweden: "se", denmark: "dk", norway: "no", finland: "fi", ireland: "ie", israel: "il",
  switzerland: "ch", austria: "at", belgium: "be", poland: "pl", estonia: "ee", portugal: "pt", nigeria: "ng",
  kenya: "ke", "south africa": "za", egypt: "eg", brazil: "br", mexico: "mx", canada: "ca", australia: "au",
  singapore: "sg", japan: "jp", china: "cn", "south korea": "kr", indonesia: "id", "united arab emirates": "ae",
  "saudi arabia": "sa", hungary: "hu", czechia: "cz", "czech republic": "cz", slovakia: "sk", romania: "ro",
  ukraine: "ua", turkey: "tr", argentina: "ar", colombia: "co", chile: "cl", "new zealand": "nz",
};
// Country codes used as generic TLDs by startups everywhere.
const GENERIC_CCTLDS = new Set(["io", "ai", "co", "me", "tv", "gg", "ly", "so", "to", "sh", "cc", "fm", "ws", "vc"]);

const countryTld = (domain: string): string | null => {
  const tld = domain.split(".").at(-1) ?? "";
  return tld.length === 2 && !GENERIC_CCTLDS.has(tld) ? tld : null;
};

const squash = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
const CORPORATE = /\b(inc|ltd|limited|llc|gmbh|ag|sa|sas|srl|spa|plc|bv|nv|pvt|private|corp|corporation|company|group|holdings?)\b/g;
const nameKey = (name: string) => squash(name.toLowerCase().replace(/\./g, "").replace(CORPORATE, " "));

export type NameDomain = { name: string; domain: string };

// Picks a company's domain from name-to-domain suggestions (Clearbit
// Autocomplete). Precision over recall:
//  - the suggestion's name must equal the company name (ignoring case,
//    punctuation and corporate suffixes), and its domain must match the name;
//  - a domain in another country's ccTLD is dropped when the company's
//    country is known;
//  - if more than one domain remains, one in the company's own ccTLD wins;
//    otherwise it is ambiguous and nothing is returned.
export function pickSuggestedDomain(suggestions: NameDomain[], name: string, country: string | null): string | null {
  const key = nameKey(name);
  const ownTld = country ? (CCTLD[country.toLowerCase()] ?? null) : null;
  const domains = new Set<string>();
  for (const s of suggestions) {
    const domain = registrableDomain(s.domain);
    if (!domain || NOT_OFFICIAL.has(domain)) continue;
    if (nameKey(s.name) !== key || !domainMatchesName(domain, name)) continue;
    const tld = countryTld(domain);
    if (ownTld && tld && tld !== ownTld) continue;
    domains.add(domain);
  }
  if (domains.size === 1) return [...domains][0];
  if (domains.size > 1 && ownTld) {
    const local = [...domains].filter((d) => countryTld(d) === ownTld);
    if (local.length === 1) return local[0];
  }
  return null;
}
