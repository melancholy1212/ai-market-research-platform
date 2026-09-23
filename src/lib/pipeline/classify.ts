import "server-only";

import { AllProvidersFailedError, generateWithFallback } from "@/lib/ai/fallback";
import type { AIProvider } from "@/lib/ai/types";

import {
  buildRelevancePrompt,
  parseRelevance,
  RELEVANCE_BATCH_SIZE,
  RELEVANCE_SCHEMA,
  RELEVANCE_SYSTEM,
  type ClassifiableSource,
  type QueryConstraints,
  type SourceClassification,
} from "./relevance-ai";

export type AIRelevanceResult = {
  constraints: QueryConstraints | null;
  classifications: Map<string, SourceClassification>;
  batches: number;
  failedBatches: number;
  providers: string[]; // "gemini (gemini-3.5-flash)" per successful batch
};

// Classifies sources in batches, one AI call per batch, sequentially so a
// free tier's per-minute token budget is not spent in a single burst. A
// failed batch leaves its sources unclassified for the caller's fallback;
// it never throws for AI failures.
export async function classifyWithAI(
  research: { query: string; focus: string | null },
  sources: ClassifiableSource[],
  providers: AIProvider[],
): Promise<AIRelevanceResult> {
  const result: AIRelevanceResult = { constraints: null, classifications: new Map(), batches: 0, failedBatches: 0, providers: [] };
  for (let i = 0; i < sources.length; i += RELEVANCE_BATCH_SIZE) {
    const batch = sources.slice(i, i + RELEVANCE_BATCH_SIZE);
    result.batches++;
    try {
      const out = await generateWithFallback(providers, () => {
        const { prompt, aliases } = buildRelevancePrompt(research, batch);
        return {
          request: {
            system: RELEVANCE_SYSTEM,
            prompt,
            schema: RELEVANCE_SCHEMA,
            schemaName: "relevance",
            // Gemini counts its internal reasoning against this budget.
            maxOutputTokens: 8192,
          },
          parse: (text: string) => parseRelevance(text, aliases),
        };
      });
      result.constraints ??= out.value.constraints;
      for (const [id, c] of out.value.classifications) result.classifications.set(id, c);
      result.providers.push(`${out.provider} (${out.model})`);
    } catch (error) {
      if (!(error instanceof AllProvidersFailedError)) console.error("relevance batch failed", error);
      result.failedBatches++;
    }
  }
  return result;
}
