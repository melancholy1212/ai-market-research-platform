import "server-only";

import { ProviderError, requestJson } from "@/lib/http";

import type { AIProvider, GenerateJsonRequest, JsonSchema } from "./types";

// Tried in order. Free-tier Flash models are regularly overloaded (HTTP 503
// "high demand"); Flash-Lite is lighter, faster and usually available.
const DEFAULT_MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite"];

export function geminiModels(): string[] {
  const list = (process.env.GEMINI_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_MODELS;
}

// Gemini's responseSchema uses an OpenAPI-style subset with upper-case type
// names and no additionalProperties.
function toGeminiSchema(schema: JsonSchema): Record<string, unknown> {
  switch (schema.type) {
    case "string":
      return {
        type: "STRING",
        ...(schema.description ? { description: schema.description } : {}),
        ...(schema.enum ? { format: "enum", enum: schema.enum } : {}),
      };
    case "number":
      return { type: "NUMBER", ...(schema.description ? { description: schema.description } : {}) };
    case "array":
      return { type: "ARRAY", items: toGeminiSchema(schema.items) };
    case "object":
      return {
        type: "OBJECT",
        properties: Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, toGeminiSchema(v)])),
        required: schema.required,
        propertyOrdering: Object.keys(schema.properties),
      };
  }
}

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

// One provider per model, so the fallback chain moves to the next model when
// one is overloaded or out of quota.
export const createGemini = (model: string): AIProvider => ({
  id: "gemini",
  model,
  maxInputTokens: 30_000,

  isConfigured: () => Boolean(process.env.GEMINI_API_KEY),

  async generateJson(request: GenerateJsonRequest) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new ProviderError("gemini", "unauthorized", "GEMINI_API_KEY is not set");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const body = {
      systemInstruction: { parts: [{ text: request.system }] },
      contents: [{ role: "user", parts: [{ text: request.prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(request.schema),
        temperature: 0.2,
        maxOutputTokens: request.maxOutputTokens,
      },
    };

    const data = (await requestJson(url, {
      provider: "gemini",
      init: {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      timeoutMs: 120_000,
      // A 429 means the free quota is spent; fall back instead of waiting.
      retries: 0,
    })) as GeminiResponse;

    if (data.promptFeedback?.blockReason) {
      throw new ProviderError("gemini", "malformed", `prompt blocked (${data.promptFeedback.blockReason})`);
    }
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (candidate?.finishReason && candidate.finishReason !== "STOP") {
      throw new ProviderError("gemini", "malformed", `generation stopped early (${candidate.finishReason})`);
    }
    if (!text) throw new ProviderError("gemini", "malformed", "empty response");

    return {
      text,
      inputTokens: data.usageMetadata?.promptTokenCount ?? null,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? null,
    };
  },
});
