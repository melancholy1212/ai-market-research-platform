// fetch wrapper for the Supabase client that retries transient network
// failures (the request never got a response). Only requests that are safe
// to repeat are retried: reads, updates, deletes and upserts. A plain
// insert is not, because the first attempt may have reached the database,
// unless the caller marks it with RETRY_SAFE_HEADER (for example a log line,
// where a rare duplicate beats a missing entry).

const RETRY_DELAYS_MS = [300, 1000];
export const RETRY_SAFE_HEADER = "x-retry-safe";

function isRepeatable(init: RequestInit | undefined): boolean {
  if (new Headers(init?.headers).has(RETRY_SAFE_HEADER)) return true;
  const method = (init?.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "PATCH" || method === "DELETE") return true;
  if (method !== "POST") return false;
  const prefer = new Headers(init?.headers).get("prefer") ?? "";
  return prefer.includes("resolution="); // PostgREST upsert
}

export function createRetryingFetch(baseFetch: typeof fetch = fetch): typeof fetch {
  return async (input, originalInit) => {
    const repeatable = isRepeatable(originalInit);
    // The marker is for this wrapper only; don't send it upstream.
    let init = originalInit;
    if (init?.headers && new Headers(init.headers).has(RETRY_SAFE_HEADER)) {
      const headers = new Headers(init.headers);
      headers.delete(RETRY_SAFE_HEADER);
      init = { ...init, headers };
    }
    if (!repeatable) return baseFetch(input, init);
    for (let attempt = 0; ; attempt++) {
      try {
        return await baseFetch(input, init);
      } catch (error) {
        // An aborted request was cancelled on purpose; don't retry it.
        const aborted = error instanceof DOMException && error.name === "AbortError";
        if (aborted || attempt >= RETRY_DELAYS_MS.length) throw error;
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      }
    }
  };
}
