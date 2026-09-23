import { describe, expect, it, vi } from "vitest";

import { createRetryingFetch, RETRY_SAFE_HEADER } from "./retrying-fetch";

const ok = () => new Response("ok");
const networkError = () => new TypeError("fetch failed");

describe("createRetryingFetch", () => {
  it("retries a GET after a network failure", async () => {
    const base = vi.fn().mockRejectedValueOnce(networkError()).mockResolvedValueOnce(ok());
    const res = await createRetryingFetch(base)("https://db.test/rest/v1/x");
    expect(await res.text()).toBe("ok");
    expect(base).toHaveBeenCalledTimes(2);
  });

  it("retries PATCH and upserts, but not plain inserts", async () => {
    for (const [init, expectedCalls] of [
      [{ method: "PATCH" }, 2],
      [{ method: "POST", headers: { Prefer: "resolution=ignore-duplicates" } }, 2],
      [{ method: "POST", headers: { Prefer: "return=representation" } }, 1],
    ] as const) {
      const base = vi.fn().mockRejectedValueOnce(networkError()).mockResolvedValueOnce(ok());
      const call = createRetryingFetch(base)("https://db.test", init).catch(() => null);
      await call;
      expect(base).toHaveBeenCalledTimes(expectedCalls);
    }
  });

  it("does not retry HTTP error responses, which are not network failures", async () => {
    const base = vi.fn().mockResolvedValue(new Response("err", { status: 500 }));
    const res = await createRetryingFetch(base)("https://db.test");
    expect(res.status).toBe(500);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("gives up after the retry budget", async () => {
    const base = vi.fn().mockRejectedValue(networkError());
    await expect(createRetryingFetch(base)("https://db.test")).rejects.toThrow("fetch failed");
    expect(base).toHaveBeenCalledTimes(3);
  });
});

describe("createRetryingFetch: opt-in", () => {
  it("retries an insert marked retry-safe and strips the marker", async () => {
    const base = vi.fn().mockRejectedValueOnce(networkError()).mockResolvedValueOnce(ok());
    await createRetryingFetch(base)("https://db.test", { method: "POST", headers: { [RETRY_SAFE_HEADER]: "1" } });
    expect(base).toHaveBeenCalledTimes(2);
    const sentHeaders = new Headers(base.mock.calls[1][1].headers);
    expect(sentHeaders.has(RETRY_SAFE_HEADER)).toBe(false);
  });
});
