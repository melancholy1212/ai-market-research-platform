import { afterEach, describe, expect, it, vi } from "vitest";

import { ProviderError, requestJson, requestText } from "./http";

function mockFetch(...responses: Array<Response | Error>) {
  const fn = vi.fn();
  for (const r of responses) {
    if (r instanceof Error) fn.mockRejectedValueOnce(r);
    else fn.mockResolvedValueOnce(r);
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

// Retry-After: 0 keeps rate-limit retries instant in tests.
const rateLimited = () => new Response("slow down", { status: 429, headers: { "Retry-After": "0" } });

afterEach(() => vi.unstubAllGlobals());

describe("requestText", () => {
  it("returns the body on success", async () => {
    mockFetch(new Response("hello"));
    await expect(requestText("https://x.test", { provider: "p" })).resolves.toBe("hello");
  });

  it("retries a 429 and succeeds", async () => {
    const fetch = mockFetch(rateLimited(), new Response("ok"));
    await expect(requestText("https://x.test", { provider: "p", retries: 1 })).resolves.toBe("ok");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("gives up on persistent rate limiting with a rate_limited error", async () => {
    const fetch = mockFetch(rateLimited(), rateLimited());
    const error = await requestText("https://x.test", { provider: "p", retries: 1 }).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.kind).toBe("rate_limited");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry client errors", async () => {
    const fetch = mockFetch(new Response("bad", { status: 400 }));
    const error = await requestText("https://x.test", { provider: "p", retries: 2 }).catch((e) => e);
    expect(error.kind).toBe("http");
    expect(error.status).toBe(400);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("classifies 401 as unauthorized without retrying", async () => {
    const fetch = mockFetch(new Response("no", { status: 401 }));
    const error = await requestText("https://x.test", { provider: "p" }).catch((e) => e);
    expect(error.kind).toBe("unauthorized");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("applies a provider-specific status mapping", async () => {
    mockFetch(new Response("quota", { status: 432 }));
    const error = await requestText("https://x.test", {
      provider: "p",
      classifyStatus: (s) => (s === 432 ? "quota_exceeded" : undefined),
    }).catch((e) => e);
    expect(error.kind).toBe("quota_exceeded");
  });

  it("retries network failures and reports the last one", async () => {
    const fetch = mockFetch(new TypeError("fetch failed"), new TypeError("fetch failed"));
    const error = await requestText("https://x.test", { provider: "p", retries: 1 }).catch((e) => e);
    expect(error.kind).toBe("network");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reports a timeout as a timeout", async () => {
    mockFetch(new DOMException("timed out", "TimeoutError"));
    const error = await requestText("https://x.test", { provider: "p", retries: 0 }).catch((e) => e);
    expect(error.kind).toBe("timeout");
  });
});

describe("requestJson", () => {
  it("rejects non-JSON bodies as malformed", async () => {
    mockFetch(new Response("<html>oops</html>"));
    const error = (await requestJson("https://x.test", { provider: "p" }).catch((e) => e)) as ProviderError;
    expect(error.kind).toBe("malformed");
  });
});
