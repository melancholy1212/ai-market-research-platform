// Deterministic URL normalization used as the exact-duplicate key for
// sources (sources.canonical_url). Conservative on purpose: it only removes
// differences that never change which document a URL points to.

// Query parameters that only carry tracking/attribution data.
const TRACKING_PARAMS = new Set([
  "gclid", "dclid", "fbclid", "msclkid", "twclid", "igshid", "yclid",
  "mc_cid", "mc_eid", "_ga", "_gl", "ref_src", "ref_url", "cmpid", "ocid",
  "sr_share", "smid", "spm", "share", "fromrss", "rss",
]);

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith("utm_") || TRACKING_PARAMS.has(lower);
}

// Returns null for anything that is not an absolute http(s) URL.
export function normalizeUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  // http/https and www/bare host serve the same document on practically
  // every news and company site.
  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  url.port = url.port === "443" || url.port === "80" ? "" : url.port;
  url.hash = "";
  url.username = "";
  url.password = "";

  const kept = [...url.searchParams.entries()]
    .filter(([name]) => !isTrackingParam(name))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  url.search = new URLSearchParams(kept).toString();

  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "") || "/";

  return url.toString();
}

// Hostname without "www.", used as a fallback publisher label.
export function displayHost(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}
