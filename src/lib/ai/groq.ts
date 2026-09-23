import "server-only";

import { ProviderError, requestJson } from "@/lib/http";

import type { AIProvider, GenerateJsonRequest } from "./types";

// Supports strict structured outputs (constrained decoding).
const DEFAULT_MODEL = "openai/gpt-oss-120b";

type GroqResponse = {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export const groq: AIProvider = {
  id: "groq",
  get model() {
    return process.env.GROQ_MODEL || DEFAULT_MODEL;
  },

  // Free tier: 8,000 tokens per minute including the completion.
  maxInputTokens: 4_000,

  isConfigured: () => Boolean(process.env.GROQ_API_KEY),

  async generateJson(request: GenerateJsonRequest) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new ProviderError("groq", "unauthorized", "GROQ_API_KEY is not set");

    const body = {
      model: this.model,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.prompt },
      ],
      temperature: 0.2,
      max_completion_tokens: Math.min(request.maxOutputTokens, 3_500),
      // gpt-oss models reason before answering; reasoning tokens count
      // against the same budget, so keep it short.
      ...(this.model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
      response_format: {
        type: "json_schema",
        json_schema: { name: request.schemaName, strict: true, schema: request.schema },
      },
    };

    const data = (await requestJson("https://api.groq.com/openai/v1/chat/completions", {
      provider: "groq",
      init: {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      timeoutMs: 120_000,
      retries: 0,
    })) as GroqResponse;

    const choice = data.choices?.[0];
    const text = choice?.message?.content ?? "";
    if (choice?.finish_reason && choice.finish_reason !== "stop") {
      throw new ProviderError("groq", "malformed", `generation stopped early (${choice.finish_reason})`);
    }
    if (!text) throw new ProviderError("groq", "malformed", "empty response");

    return {
      text,
      inputTokens: data.usage?.prompt_tokens ?? null,
      outputTokens: data.usage?.completion_tokens ?? null,
    };
  },
};
