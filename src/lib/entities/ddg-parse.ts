import { domainMatchesName, registrableDomain } from "./domain";

// Parsing for DuckDuckGo's HTML results page (html.duckduckgo.com/html/).

// DuckDuckGo answers suspected bots with HTTP 202 and an "anomaly" page
// instead of results.
export function isBlockedPage(status: number, html: string): boolean {
  return status === 202 || /anomaly-modal|bots use DuckDuckGo too/i.test(html);
}

// Result links look like //duckduckgo.com/l/?uddg=<encoded target>&rut=...
export function parseResultUrls(html: string): string[] {
  const urls: string[] = [];
  for (const match of html.matchAll(/class="result__a"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*class="result__a"/g)) {
    const href = (match[1] ?? match[2]).replace(/&amp;/g, "&");
    let target = href;
    const uddg = /[?&]uddg=([^&]+)/.exec(href);
    if (uddg) {
      try {
        target = decodeURIComponent(uddg[1]);
      } catch {
        continue;
      }
    }
    if (!/^https?:\/\//i.test(target)) continue;
    if (/(^|\.)duckduckgo\.com$/i.test(new URL(target).hostname)) continue; // ads, internal links
    if (!urls.includes(target)) urls.push(target);
  }
  return urls;
}

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
