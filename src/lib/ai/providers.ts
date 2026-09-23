import "server-only";

import { createGemini, geminiModels } from "./gemini";
import { groq } from "./groq";
import type { AIProvider } from "./types";

const ALL: Record<string, () => AIProvider[]> = {
  gemini: () => geminiModels().map(createGemini),
  groq: () => [groq],
};

// Fallback chain from AI_PROVIDERS (e.g. "groq,gemini"); Gemini expands to
// one step per model in GEMINI_MODELS. Unknown names are ignored. Default:
// each Gemini model in turn, then Groq.
export function aiProviders(): AIProvider[] {
  const order = (process.env.AI_PROVIDERS || "gemini,groq")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((id, i, all) => ALL[id] && all.indexOf(id) === i);
  return (order.length ? order : ["gemini", "groq"]).flatMap((id) => ALL[id]());
}
