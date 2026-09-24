// News sites searched through their WordPress search feeds
// (`/?s=<keywords>&feed=rss2`), which return full-text search results as RSS,
// often reaching back months. Each site was checked by hand to return real,
// topic-filtered results; sites whose search feed was empty, blocked or not
// actually filtered were left out. EU-Startups was removed after it
// answered every request from Vercel's servers with HTTP 403.
export type RssSite = {
  id: string;
  name: string;
  baseUrl: string;
  coverage: string;
};

export const RSS_SITES: readonly RssSite[] = [
  { id: "techcrunch", name: "TechCrunch", baseUrl: "https://techcrunch.com", coverage: "Global tech and startups" },
  { id: "crunchbase-news", name: "Crunchbase News", baseUrl: "https://news.crunchbase.com", coverage: "Venture funding" },
  { id: "inc42", name: "Inc42", baseUrl: "https://inc42.com", coverage: "Indian startups" },
  { id: "startup-daily", name: "Startup Daily", baseUrl: "https://www.startupdaily.net", coverage: "Australian startups" },
  { id: "techcabal", name: "TechCabal", baseUrl: "https://techcabal.com", coverage: "African tech" },
  { id: "securityweek", name: "SecurityWeek", baseUrl: "https://www.securityweek.com", coverage: "Cybersecurity" },
  { id: "uktech-news", name: "UKTN", baseUrl: "https://www.uktech.news", coverage: "UK tech and startups" },
];

export function searchFeedUrl(site: RssSite, keywords: string): string {
  return `${site.baseUrl}/?${new URLSearchParams({ s: keywords, feed: "rss2" })}`;
}

// Display names for outlets that also appear through web search, so
// "inc42.com" and "Inc42" are one publisher. Includes outlets that are not
// searched directly.
export const KNOWN_OUTLETS: ReadonlyMap<string, string> = new Map([
  ...RSS_SITES.map((site) => [new URL(site.baseUrl).hostname.replace(/^www\./, ""), site.name] as const),
  ["eu-startups.com", "EU-Startups"],
  ["tech.eu", "Tech.eu"],
  ["sifted.eu", "Sifted"],
]);

// Home region of outlets whose coverage is regional; an article from Inc42 is
// about India even when its headline does not say so. Values are geo place
// names (countries or regions).
export const OUTLET_REGIONS: ReadonlyMap<string, string> = new Map([
  ["inc42.com", "india"],
  ["startupdaily.net", "australia"],
  ["techcabal.com", "africa"],
  ["eu-startups.com", "europe"],
  ["tech.eu", "europe"],
  ["sifted.eu", "europe"],
  ["yourstory.com", "india"],
  ["uktech.news", "united kingdom"],
]);
