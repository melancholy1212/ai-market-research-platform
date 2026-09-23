import "server-only";

import { createHash } from "node:crypto";

import type { Json } from "@/lib/supabase/database.types";
import { getSupabase } from "@/lib/supabase/server";

// JSON with object keys sorted, so logically equal requests hash the same.
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function cacheKey(request: unknown): string {
  return createHash("sha256").update(stableStringify(request)).digest("hex");
}

// A fresh cached response for `request`, or undefined. Never calls out.
export async function readCache(provider: string, request: unknown): Promise<Json | undefined> {
  const { data, error } = await getSupabase()
    .from("provider_cache")
    .select("response")
    .eq("provider", provider)
    .eq("cache_key", cacheKey(request))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) console.warn(`provider_cache read failed for ${provider}`, error.message);
  return data?.response;
}

// Returns the cached raw response for `request` if fresh, otherwise calls
// `fetcher` and stores what it returns. Callers cache raw provider
// responses and parse afterwards, so parser fixes apply to cached data too.
//
// The cache is an optimization only: if reading or writing it fails, the
// request goes to the provider as if there were no cache.
export async function withCache(
  provider: string,
  request: unknown,
  ttlSeconds: number,
  fetcher: () => Promise<Json>,
): Promise<{ response: Json; fromCache: boolean }> {
  const key = cacheKey(request);
  const supabase = getSupabase();

  const { data: hit, error: readError } = await supabase
    .from("provider_cache")
    .select("response")
    .eq("provider", provider)
    .eq("cache_key", key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (readError) console.warn(`provider_cache read failed for ${provider}`, readError.message);
  if (hit) return { response: hit.response, fromCache: true };

  const response = await fetcher();

  const now = Date.now();
  const { error: writeError } = await supabase.from("provider_cache").upsert({
    provider,
    cache_key: key,
    response,
    fetched_at: new Date(now).toISOString(),
    expires_at: new Date(now + ttlSeconds * 1000).toISOString(),
  });
  if (writeError) console.warn(`provider_cache write failed for ${provider}`, writeError.message);

  return { response, fromCache: false };
}
