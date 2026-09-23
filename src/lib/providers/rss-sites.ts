// News sites searched through their WordPress search feeds
// (`/?s=<keywords>&feed=rss2`), which return full-text search results as RSS,
// often reaching back months. Each site was checked by hand to return real,
// topic-filtered results; sites whose search feed was empty, blocked or not
// actually filtered were left out.
export type RssSite = {
  id: string;
  name: string;
  baseUrl: string;
  coverage: string;
};

export const RSS_SITES: readonly RssSite[] = [
  { id: "techcrunch", name: "TechCrunch", baseUrl: "https://techcrunch.com", coverage: "Global tech and startups" },
  { id: "crunchbase-news", name: "Crunchbase News", baseUrl: "https://news.crunchbase.com", coverage: "Venture funding" },
  { id: "eu-startups", name: "EU-Startups", baseUrl: "https://www.eu-startups.com", coverage: "European startups" },
  { id: "inc42", name: "Inc42", baseUrl: "https://inc42.com", coverage: "Indian startups" },
  { id: "startup-daily", name: "Startup Daily", baseUrl: "https://www.startupdaily.net", coverage: "Australian startups" },
  { id: "techcabal", name: "TechCabal", baseUrl: "https://techcabal.com", coverage: "African tech" },
  { id: "securityweek", name: "SecurityWeek", baseUrl: "https://www.securityweek.com", coverage: "Cybersecurity" },
];

export function searchFeedUrl(site: RssSite, keywords: string): string {
  return `${site.baseUrl}/?${new URLSearchParams({ s: keywords, feed: "rss2" })}`;
}
