// The boundary between the research pipeline and LLM vendors. The pipeline
// asks for JSON matching a schema; providers decide how to enforce it.

// JSON Schema subset understood by every provider: object/array/string,
// every property required, no additional properties. Unknown values are
// empty strings rather than null, which keeps the schema portable.
export type JsonSchema =
  | { type: "string"; description?: string }
  | { type: "array"; items: JsonSchema; description?: string }
  | {
      type: "object";
      properties: Record<string, JsonSchema>;
      required: string[];
      additionalProperties: false;
      description?: string;
    };

export type GenerateJsonRequest = {
  system: string;
  prompt: string;
  schema: JsonSchema;
  schemaName: string;
  maxOutputTokens: number;
};

export type GenerateJsonResult = {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

export interface AIProvider {
  readonly id: string;
  readonly model: string;
  // Rough ceiling for prompt size in tokens. Free tiers cap tokens per
  // minute (Groq's free gpt-oss-120b: 8,000 TPM, counting the output too),
  // so callers shrink the prompt to fit the provider they are calling.
  readonly maxInputTokens: number;
  isConfigured(): boolean;
  generateJson(request: GenerateJsonRequest): Promise<GenerateJsonResult>;
}
