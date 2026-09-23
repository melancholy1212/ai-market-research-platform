import { describe, expect, it, vi } from "vitest";

import { ProviderError } from "@/lib/http";

import { AllProvidersFailedError, generateWithFallback } from "./fallback";
import type { AIProvider } from "./types";

const request = { system: "s", prompt: "p", schema: { type: "string" as const }, schemaName: "x", maxOutputTokens: 10 };

function provider(id: string, behaviour: () => Promise<string>, configured = true): AIProvider {
  return {
    id,
    model: `${id}-model`,
    maxInputTokens: 1000,
    isConfigured: () => configured,
    generateJson: vi.fn(async () => ({ text: await behaviour(), inputTokens: 1, outputTokens: 2 })),
  };
}

const parseJson = (text: string) => JSON.parse(text) as unknown;
const prepare = () => ({ request, parse: parseJson });

describe("generateWithFallback", () => {
  it("uses the first provider when it succeeds and never calls the next", async () => {
    const second = provider("groq", async () => '"b"');
    const result = await generateWithFallback([provider("gemini", async () => '"a"'), second], prepare);
    expect(result).toMatchObject({ value: "a", provider: "gemini", model: "gemini-model", failedAttempts: [] });
    expect(second.generateJson).not.toHaveBeenCalled();
  });

  it("falls back on a rate limit and records the failed attempt", async () => {
    const result = await generateWithFallback(
      [
        provider("gemini", async () => {
          throw new ProviderError("gemini", "rate_limited", "HTTP 429", 429);
        }),
        provider("groq", async () => '"b"'),
      ],
      prepare,
    );
    expect(result.provider).toBe("groq");
    expect(result.failedAttempts).toEqual([{ provider: "gemini", model: "gemini-model", error: "rate_limited, HTTP 429" }]);
  });

  it("falls back when the output fails validation", async () => {
    const result = await generateWithFallback(
      [provider("gemini", async () => "not json"), provider("groq", async () => '"ok"')],
      prepare,
    );
    expect(result.provider).toBe("groq");
  });

  it("skips providers that are not configured", async () => {
    const skipped = provider("gemini", async () => '"a"', false);
    const result = await generateWithFallback([skipped, provider("groq", async () => '"b"')], prepare);
    expect(result.provider).toBe("groq");
    expect(skipped.generateJson).not.toHaveBeenCalled();
    expect(result.failedAttempts).toEqual([]);
  });

  it("throws with every attempt when all providers fail", async () => {
    const error = await generateWithFallback(
      [
        provider("gemini", async () => {
          throw new ProviderError("gemini", "timeout", "slow");
        }),
        provider("groq", async () => {
          throw new ProviderError("groq", "quota_exceeded", "HTTP 429", 429);
        }),
      ],
      prepare,
    ).catch((e) => e);
    expect(error).toBeInstanceOf(AllProvidersFailedError);
    expect(error.attempts.map((a: { provider: string }) => a.provider)).toEqual(["gemini", "groq"]);
  });
});

describe("generateWithFallback: per-provider requests", () => {
  it("prepares a request for each provider it tries", async () => {
    const seen: string[] = [];
    await generateWithFallback(
      [
        provider("gemini", async () => {
          throw new ProviderError("gemini", "rate_limited", "HTTP 429", 429);
        }),
        provider("groq", async () => '"b"'),
      ],
      (p) => {
        seen.push(`${p.id}:${p.maxInputTokens}`);
        return { request, parse: parseJson };
      },
    );
    expect(seen).toEqual(["gemini:1000", "groq:1000"]);
  });
});
