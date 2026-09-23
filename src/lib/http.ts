// HTTP helper for external providers: per-attempt timeouts, bounded retries
// with backoff on transient failures, and typed errors so callers can tell a
// rate limit from an outage from a bad response.

export type ProviderErrorKind =
  | "timeout"
  | "network"
  | "rate_limited"
  | "quota_exceeded"
  | "unauthorized"
  | "http"
  | "malformed";

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(`${provider}: ${message}`);
    this.name = "ProviderError";
  }
}

export const USER_AGENT =
  "ai-market-research-platform/0.1 (+https://github.com/melancholy1212/ai-market-research-platform)";

type RequestOptions = {
  provider: string;
  init?: RequestInit;
  timeoutMs?: number;
  retries?: number;
  // Minimum wait before retrying a 429 when the server sends no Retry-After.
  rateLimitBackoffMs?: number;
  // Map a provider's non-standard statuses (e.g. Tavily's 432) to an error kind.
  classifyStatus?: (status: number) => ProviderErrorKind | undefined;
};

function kindForStatus(status: number): ProviderErrorKind {
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403) return "unauthorized";
  return "http";
}

function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Fetches `url` and returns the response body as text. Only 5xx, 429,
// timeouts and network errors are retried; 4xx means the request itself is
// wrong and retrying would not help.
export async function requestText(url: string, options: RequestOptions): Promise<string> {
  const { provider, init, timeoutMs = 15_000, retries = 2, rateLimitBackoffMs = 2_000 } = options;
  let lastError: ProviderError | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let waitMs = 500 * 2 ** attempt;
    let response: Response;
    let body: string;
    try {
      response = await fetch(url, {
        ...init,
        headers: { "User-Agent": USER_AGENT, ...init?.headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      body = await response.text();
    } catch (error) {
      lastError =
        error instanceof DOMException && error.name === "TimeoutError"
          ? new ProviderError(provider, "timeout", `no response within ${timeoutMs}ms`)
          : new ProviderError(provider, "network", "request failed");
      if (attempt < retries) await sleep(waitMs);
      continue;
    }

    if (response.ok) return body;

    const kind = options.classifyStatus?.(response.status) ?? kindForStatus(response.status);
    lastError = new ProviderError(provider, kind, `HTTP ${response.status}`, response.status);
    const retryable = kind === "rate_limited" || (kind === "http" && response.status >= 500);
    if (!retryable) throw lastError;

    if (kind === "rate_limited") waitMs = retryAfterMs(response) ?? Math.max(waitMs, rateLimitBackoffMs);
    if (attempt < retries) await sleep(Math.min(waitMs, 10_000));
  }
  throw lastError!;
}

export async function requestJson(url: string, options: RequestOptions): Promise<unknown> {
  const text = await requestText(url, options);
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError(options.provider, "malformed", "response was not valid JSON");
  }
}
