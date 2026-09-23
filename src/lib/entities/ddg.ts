import "server-only";

import { ProviderError } from "@/lib/http";
import { cacheKey, readCache, withCache } from "@/lib/providers/cache";
import type { Json } from "@/lib/supabase/database.types";
import { getSupabase } from "@/lib/supabase/server";

import { isBlockedPage, parseResultUrls, pickOfficialDomain } from "./ddg-parse";

// Website discovery through DuckDuckGo's HTML endpoint, used only for
// companies neither the sources nor Wikidata could give a website for.
//
// DuckDuckGo blocks quickly (this project's VM saw a bot check after about
// three requests), so every layer here exists to send fewer requests:
//  - callers cap lookups per research and ask only for companies that need it;
//  - answers, including "nothing found", are cached for weeks and shared
//    across research runs;
//  - requests from one process are serialized and spaced out;
//  - the first block page trips a circuit breaker stored in the database,
//    so every run (on any server instance) stops asking for a while.

const ENDPOINT = "https://html.duckduckgo.com/html/";
const TTL_SECONDS = 21 * 24 * 60 * 60;
const MIN_INTERVAL_MS = 5_000;
const COOLDOWN_MS = 30 * 60 * 1000;
const BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0";
// A block applies to the network we send from, so the breaker is scoped:
// a blocked development machine must not pause lookups on the deployment.
const BREAKER = { provider: "ddg", cache_key: cacheKey({ op: "cooldown", scope: process.env.VERCEL ? "vercel" : "local" }) };
// The cache stores parsed answers, not pages, so a parser change must
// invalidate them: bump this whenever ddg-parse.ts changes behaviour.
const PARSER_VERSION = 1;

let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

// Runs `fn` after every earlier request in this process, at least
// MIN_INTERVAL_MS after the previous one.
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function isCoolingDown(): Promise<boolean> {
  const { data } = await getSupabase()
    .from("provider_cache")
    .select("expires_at")
    .eq("provider", BREAKER.provider)
    .eq("cache_key", BREAKER.cache_key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return Boolean(data);
}

async function tripBreaker(): Promise<void> {
  const now = Date.now();
  await getSupabase().from("provider_cache").upsert({
    ...BREAKER,
    response: { blocked_at: new Date(now).toISOString() },
    fetched_at: new Date(now).toISOString(),
    expires_at: new Date(now + COOLDOWN_MS).toISOString(),
  });
}

export class SearchBlockedError extends ProviderError {
  constructor() {
    super("ddg", "rate_limited", "DuckDuckGo served a bot check");
  }
}

const websiteRequest = (name: string, hint: string) => {
  const query = `${name} ${hint}`.replace(/\s+/g, " ").trim();
  return { query, key: { op: "website", query: query.toLowerCase(), v: PARSER_VERSION } };
};

const domainOf = (response: Json | undefined) => {
  const domain = (response as { domain?: unknown } | undefined)?.domain;
  return typeof domain === "string" ? domain : null;
};

// A previously stored answer, without contacting DuckDuckGo: undefined if
// this company was never looked up, null if it was and nothing was found.
export async function cachedCompanyWebsite(name: string, hint: string): Promise<string | null | undefined> {
  const response = await readCache("ddg", websiteRequest(name, hint).key);
  return response === undefined ? undefined : domainOf(response);
}

// Returns the company's website domain, null if the search found none, or
// throws SearchBlockedError when DuckDuckGo is blocking us.
export async function findCompanyWebsite(name: string, hint: string): Promise<{ domain: string | null; fromCache: boolean }> {
  const { query, key } = websiteRequest(name, hint);
  const { response, fromCache } = await withCache("ddg", key, TTL_SECONDS, async () => {
    if (await isCoolingDown()) throw new SearchBlockedError();
    return throttled(async () => {
      let res: Response;
      let html: string;
      try {
        res = await fetch(`${ENDPOINT}?${new URLSearchParams({ q: query })}`, {
          headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
          signal: AbortSignal.timeout(12_000),
        });
        html = await res.text();
      } catch {
        throw new ProviderError("ddg", "network", "request failed");
      }
      if (isBlockedPage(res.status, html) || res.status === 403 || res.status === 429) {
        await tripBreaker();
        throw new SearchBlockedError();
      }
      if (!res.ok) throw new ProviderError("ddg", "http", `HTTP ${res.status}`, res.status);
      // Cache only the answer, not the page: a few bytes per company.
      return { domain: pickOfficialDomain(parseResultUrls(html), name) } as Json;
    });
  });
  return { domain: domainOf(response), fromCache };
}
