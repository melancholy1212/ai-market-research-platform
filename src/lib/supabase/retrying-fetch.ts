// fetch wrapper for the Supabase client that retries transient network
// failures (the request never got a response). Only requests that are safe
// to repeat are retried: reads, updates, deletes and upserts. A plain
// insert is not, because the first attempt may have reached the database,
// unless the caller marks it with RETRY_SAFE_HEADER (for example a log line,
// where a rare duplicate beats a missing entry).

const RETRY_DELAYS_MS = [300, 1000];
// Per attempt. Without it, a connection that hangs (seen on a flaky network)
// stalls the whole research run for minutes.
const ATTEMPT_TIMEOUT_MS = 20_000;
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
    const withTimeout = (): RequestInit => ({
      ...init,
      signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(ATTEMPT_TIMEOUT_MS)]) : AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    });
    if (!repeatable) return baseFetch(input, withTimeout());
    for (let attempt = 0; ; attempt++) {
      try {
        return await baseFetch(input, withTimeout());
      } catch (error) {
        // An aborted request was cancelled on purpose; don't retry it.
        // A timed-out one is a network failure and is retried.
        const aborted = error instanceof DOMException && error.name === "AbortError";
        if (aborted || attempt >= RETRY_DELAYS_MS.length) throw error;
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      }
    }
  };
}
