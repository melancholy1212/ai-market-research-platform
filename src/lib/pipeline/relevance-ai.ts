import type { JsonSchema } from "@/lib/ai/types";
import { displayHost } from "@/lib/url";

// AI relevance classification: reads the research question's constraints
// (topic, geography, entity type, industry, time) and classifies each
// collected story as direct, contextual or irrelevant. Runs between
// deduplication and analysis; the keyword scorer in relevance.ts is the
// fallback when this is unavailable.

export const RELEVANCE_LABELS = ["direct", "contextual", "irrelevant"] as const;
export type RelevanceLabel = (typeof RELEVANCE_LABELS)[number];

export const ENTITY_CONSTRAINTS = ["startup", "established_company", "investor", "research_institution", "any"] as const;
export type EntityConstraint = (typeof ENTITY_CONSTRAINTS)[number];

export type QueryConstraints = {
  topic: string;
  geography: string[];
  entityType: EntityConstraint;
  industry: string | null;
  timeRange: string | null;
};

export type SourceClassification = { label: RelevanceLabel; score: number; reason: string };

export type ClassifiableSource = {
  id: string;
  title: string | null;
  url: string;
  publisher: string | null;
  publishedAt: string | null;
  snippet: string | null;
};

// Stories per call: keeps a batch well inside Groq's free-tier 8,000 tokens
// per minute (input and output) while needing only 1-2 calls per research.
export const RELEVANCE_BATCH_SIZE = 30;
const SNIPPET_CHARS = 160;

const str = (description: string): JsonSchema => ({ type: "string", description });
const obj = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const RELEVANCE_SCHEMA: JsonSchema = obj({
  constraints: obj({
    topic: str("the subject being researched, e.g. 'robotics'"),
    geography: { type: "array", items: { type: "string" }, description: "countries or regions the question is limited to; empty if none" },
    entity_type: { type: "string", enum: [...ENTITY_CONSTRAINTS], description: "kind of organization asked about" },
    industry: str("industry or sector, or empty string"),
    time_range: str("time limit stated in the question, e.g. '2026' or 'last 12 months', or empty string"),
  }),
  sources: {
    type: "array",
    items: obj({
      id: str("source ID from the list, e.g. S3"),
      label: { type: "string", enum: [...RELEVANCE_LABELS] },
      score: { type: "number", description: "0 to 1: how useful the source is for answering the question" },
      reason: str("at most 12 words explaining the label"),
    }),
  },
});

export const RELEVANCE_SYSTEM = `You screen sources for a market research question before analysis.

First identify the question's constraints: topic, geography, the kind of organization asked about (entity_type), industry, and any time range.

Then classify EVERY listed source by what it is actually about (not by which words it contains):
- direct: about the requested topic AND geography AND entity type (e.g. for "robotics startups in Japan": a Japanese robotics startup raising money, launching, or a list of such startups).
- contextual: not a direct answer but useful background for it: the same topic in the same geography with other kinds of organizations (industry trends, established companies, investors, policy), or global developments with clear bearing on that geography.
- irrelevant: a different geography with no meaningful comparison to the requested one, a different topic, a digest or newsletter about unrelated news, a job listing, or a page with no substance.

Rules:
- A source about another country's companies is irrelevant unless it explicitly compares with, or affects, the requested geography.
- Respect a time range when the question has one; clearly outdated sources are at most contextual.
- score: 0.8-1 for strong direct sources, 0.4-0.7 for contextual, below 0.3 for irrelevant.
- reason: plain words, at most 12, e.g. "Japanese robotics startup funding round" or "about Indian startups, not Japan".
- Return an entry for every source ID, once.`;

export function buildRelevancePrompt(research: { query: string; focus: string | null }, sources: ClassifiableSource[]) {
  const aliases = new Map<string, string>();
  const lines = sources.map((s, i) => {
    const alias = `S${i + 1}`;
    aliases.set(alias, s.id);
    const meta = [s.publisher ?? displayHost(s.url), s.publishedAt?.slice(0, 10), displayHost(s.url)].filter(Boolean).join(" | ");
    const snippet = s.snippet ? `\n   ${s.snippet.replace(/\s+/g, " ").slice(0, SNIPPET_CHARS)}` : "";
    return `[${alias}] ${s.title ?? "(untitled)"} | ${meta}${snippet}`;
  });
  const prompt = [
    `Research question: ${research.query}`,
    research.focus ? `Focus: ${research.focus}` : null,
    "",
    `Sources (${lines.length}):`,
    ...lines,
  ]
    .filter((l) => l !== null)
    .join("\n");
  return { prompt, aliases };
}

export class InvalidRelevanceError extends Error {}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function parseConstraints(v: unknown): QueryConstraints | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  const topic = text(c.topic);
  if (!topic) return null;
  const entityType = ENTITY_CONSTRAINTS.includes(c.entity_type as EntityConstraint) ? (c.entity_type as EntityConstraint) : "any";
  return {
    topic,
    geography: Array.isArray(c.geography) ? c.geography.map(text).filter((g): g is string => Boolean(g)) : [],
    entityType,
    industry: text(c.industry),
    timeRange: text(c.time_range),
  };
}

// Validates model output. Entries with unknown IDs or labels are ignored;
// sources the model skipped are simply absent from the result, and the
// caller classifies them with the fallback.
export function parseRelevance(raw: string, aliases: Map<string, string>) {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new InvalidRelevanceError("output was not valid JSON");
  }
  const d = (data ?? {}) as Record<string, unknown>;
  if (!Array.isArray(d.sources)) throw new InvalidRelevanceError("output had no sources array");

  const classifications = new Map<string, SourceClassification>();
  for (const item of d.sources) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    const alias = typeof e.id === "string" ? e.id.trim().toUpperCase().replace(/^SOURCE_?/, "S") : "";
    const id = aliases.get(alias);
    const label = RELEVANCE_LABELS.includes(e.label as RelevanceLabel) ? (e.label as RelevanceLabel) : null;
    if (!id || !label || classifications.has(id)) continue;
    const rawScore = typeof e.score === "number" && Number.isFinite(e.score) ? e.score : label === "direct" ? 0.8 : label === "contextual" ? 0.5 : 0.1;
    classifications.set(id, {
      label,
      score: Math.round(Math.min(1, Math.max(0, rawScore)) * 100) / 100,
      reason: (text(e.reason) ?? label).slice(0, 140),
    });
  }
  if (classifications.size === 0) throw new InvalidRelevanceError("no usable classifications");
  return { constraints: parseConstraints(d.constraints), classifications };
}

// ---------------------------------------------------------------------------
// Keyword fallback, used when AI classification is unavailable.
// ---------------------------------------------------------------------------

export function fallbackConstraints(
  research: { query: string; focus: string | null },
  keyword: { topic: string[]; placeNames: string[] },
): QueryConstraints {
  const q = `${research.query} ${research.focus ?? ""}`.toLowerCase();
  const entityType: EntityConstraint = /\bstart-?ups?\b/.test(q)
    ? "startup"
    : /\b(investors?|vcs?|venture capital|funds?)\b/.test(q)
      ? "investor"
      : /\b(universit(y|ies)|research (institutes?|labs?))\b/.test(q)
        ? "research_institution"
        : "any";
  return { topic: keyword.topic.join(" "), geography: keyword.placeNames, entityType, industry: null, timeRange: null };
}

// Maps a keyword-scorer decision onto the three labels.
export function fallbackClassification(relevance: { score: number; relevant: boolean; reasons: string[] }): SourceClassification {
  const reasons = relevance.reasons.filter((r) => !r.startsWith("found by"));
  if (!relevance.relevant) {
    return { label: "irrelevant", score: relevance.score, reason: reasons.join("; ") || "weak match for the question" };
  }
  const label: RelevanceLabel = relevance.score >= 0.7 ? "direct" : "contextual";
  return { label, score: relevance.score, reason: reasons.join("; ") || "mentions the topic and place" };
}
