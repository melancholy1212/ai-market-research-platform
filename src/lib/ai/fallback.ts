import { ProviderError } from "@/lib/http";

import type { AIProvider, GenerateJsonRequest } from "./types";

export type Attempt = { provider: string; model: string; error: string };

export type FallbackResult<T> = {
  value: T;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  // Providers tried before the one that succeeded.
  failedAttempts: Attempt[];
};

export class AllProvidersFailedError extends Error {
  constructor(public readonly attempts: Attempt[]) {
    super(`All AI providers failed: ${attempts.map((a) => `${a.provider} (${a.error})`).join("; ")}`);
    this.name = "AllProvidersFailedError";
  }
}

function describe(error: unknown): string {
  if (error instanceof ProviderError) return error.status ? `${error.kind}, HTTP ${error.status}` : error.kind;
  return error instanceof Error ? error.message : "unknown error";
}

// A request plus the parser for its output, built for a specific provider
// (prompts are sized to the provider's input budget).
export type PreparedRequest<T> = { request: GenerateJsonRequest; parse: (text: string) => T };

// Tries each configured provider in order. A provider "fails" when the call
// errors or when `parse` rejects its output, so a model that returns
// well-formed but unusable JSON also falls through to the next provider.
export async function generateWithFallback<T>(
  providers: readonly AIProvider[],
  prepare: (provider: AIProvider) => PreparedRequest<T>,
): Promise<FallbackResult<T>> {
  const failedAttempts: Attempt[] = [];
  for (const provider of providers) {
    if (!provider.isConfigured()) continue;
    try {
      const { request, parse } = prepare(provider);
      const result = await provider.generateJson(request);
      const value = parse(result.text);
      return {
        value,
        provider: provider.id,
        model: provider.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        failedAttempts,
      };
    } catch (error) {
      console.warn(`AI provider ${provider.id} failed`, error);
      failedAttempts.push({ provider: provider.id, model: provider.model, error: describe(error) });
    }
  }
  throw new AllProvidersFailedError(failedAttempts);
}
