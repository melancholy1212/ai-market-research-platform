import type { JsonSchema } from "@/lib/ai/types";
import { ENTITY_TYPES, type EntityType } from "@/lib/entities/assess";
import { displayHost } from "@/lib/url";

// Turns the collected, deduplicated sources of a research into a structured,
// source-backed analysis. The model only reads what we collected: it is not
// asked to research anything, and every claim must cite source IDs from the
// prompt. The validator below enforces that instead of trusting it.

export type AnalysisSource = {
  id: string; // database uuid
  title: string | null;
  url: string;
  publisher: string | null;
  publishedAt: string | null;
  snippet: string | null;
  // Other outlets that reported the same story (from dedup).
  alsoReportedBy: number;
  // Relevance class; contextual sources are background, not direct answers.
  label?: "direct" | "contextual";
};

export const LIMITS = {
  sources: 60,
  snippetChars: 300,
  keyFindings: 6,
  companies: 15,
  developments: 12,
  trends: 6,
} as const;

const str = (description: string): JsonSchema => ({ type: "string", description });
const ids: JsonSchema = {
  type: "array",
  items: { type: "string" },
  description: "IDs of the sources that support this item, e.g. [\"S3\", \"S12\"]",
};
const obj = (properties: Record<string, JsonSchema>, description?: string): JsonSchema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
  ...(description ? { description } : {}),
});

export const ANALYSIS_SCHEMA: JsonSchema = obj({
  overview: obj({
    summary: str("3-5 sentence overview of the topic based only on the sources"),
    key_findings: {
      type: "array",
      items: obj({ text: str("one concrete finding"), source_ids: ids }),
    },
  }),
  companies: {
    type: "array",
    items: obj({
      name: str("company name as written in the sources"),
      entity_type: { type: "string", enum: [...ENTITY_TYPES], description: "kind of organization, judged from the sources" },
      type_evidence: str("the source evidence for entity_type in a few words, e.g. 'founded 2021, raised seed round'"),
      country: str("country, or empty string if the sources do not say"),
      focus: str("what the company does, a few words"),
      website: str("website domain only if it appears in the sources, else empty string"),
      source_ids: ids,
    }),
  },
  recent_developments: {
    type: "array",
    items: obj({
      title: str("short headline of the development"),
      summary: str("1-2 sentences"),
      date: str("YYYY-MM-DD if the sources give it, else empty string"),
      company: str("name of the main company involved, exactly as in companies, or empty string"),
      source_ids: ids,
    }),
  },
  emerging_trends: {
    type: "array",
    items: obj({ title: str("trend name"), summary: str("1-2 sentences"), source_ids: ids }),
  },
});

export const ANALYSIS_SYSTEM = `You are a market research analyst. You write structured analyses strictly from the numbered sources you are given.

Rules:
- Use only information stated in the sources. Do not add facts from your own knowledge.
- Every item must cite the IDs of the sources that support it (e.g. "S4"). Only use IDs from the list. Cite the smallest set that supports the claim.
- Ignore sources that are off-topic for the research question.
- If the sources do not support a field, use an empty string. Never guess dates, countries or websites.
- A trend must be supported by at least two sources.
- Limits: at most ${LIMITS.keyFindings} key findings, ${LIMITS.companies} companies, ${LIMITS.developments} developments, ${LIMITS.trends} trends. Fewer is fine; do not pad.
- Classify each company's entity_type from concrete evidence its cited sources state about IT SPECIFICALLY, never from the name, and never merely from being named on a "top startups"/"best companies" list (a mature, publicly listed company can still appear on such a list with no distinguishing detail given). Look for a stated founding year, funding round or stage (seed/Series A-D...), employee count, "IPO"/"publicly listed"/"plc"/stock exchange, or being called decades old or a well-known incumbent. startup = sources state it is young and venture-funded, pre-IPO; established_company = sources state it is mature, publicly listed, or a well-known incumbent; investor = VC fund or investment firm; partner = organization mentioned mainly as a customer or collaborator; research_institution = university or lab; other = the sources give no real evidence of company stage either way (e.g. it is only named in a list with no distinguishing detail). When the only evidence is a bare listing, choose other, not startup.
- If the question asks for a kind of organization (e.g. startups), list those first; include other kinds only when they play a clear role, and never label them as that kind.
- Sources marked [context] are background: use them for the overview and trends, but base companies and developments mainly on the other sources.
- Write in English, plainly, without marketing language.`;

// Conservative token estimate (English prose runs ~4 characters per token).
export const estimateTokens = (text: string) => Math.ceil(text.length / 3.5);

// Room the system prompt, JSON schema and wrapper text take up.
const PROMPT_OVERHEAD_TOKENS = 1_500;

// Compact, line-oriented source list: cheaper than JSON and easy for the
// model to cite. Sources are referred to as S1..Sn, mapped back to uuids.
//
// Sources are expected most-informative first. They are added until the
// token budget is used; with a small budget, snippets are shortened so more
// sources fit.
export function buildAnalysisPrompt(
  research: { query: string; focus: string | null },
  sources: AnalysisSource[],
  maxInputTokens = 30_000,
): { prompt: string; aliases: Map<string, string>; included: AnalysisSource[] } {
  const aliases = new Map<string, string>();
  const included: AnalysisSource[] = [];
  const snippetChars = maxInputTokens < 8_000 ? 140 : LIMITS.snippetChars;
  let budget = maxInputTokens - PROMPT_OVERHEAD_TOKENS - estimateTokens(research.query + (research.focus ?? ""));
  const lines: string[] = [];

  for (const source of sources.slice(0, LIMITS.sources)) {
    const alias = `S${included.length + 1}`;
    const meta = [
      source.publisher ?? displayHost(source.url),
      source.publishedAt?.slice(0, 10),
      displayHost(source.url),
      source.alsoReportedBy > 0 ? `also reported by ${source.alsoReportedBy} other outlets` : null,
    ].filter(Boolean);
    const tag = source.label === "contextual" ? "[context] " : "";
    const snippet = source.snippet ? `\n   ${source.snippet.replace(/\s+/g, " ").slice(0, snippetChars)}` : "";
    const line = `[${alias}] ${tag}${source.title ?? "(untitled)"} | ${meta.join(" | ")}${snippet}`;
    const cost = estimateTokens(line);
    if (cost > budget) break;
    budget -= cost;
    aliases.set(alias, source.id);
    included.push(source);
    lines.push(line);
  }

  const prompt = [
    `Research question: ${research.query}`,
    research.focus ? `Focus: ${research.focus}` : null,
    "",
    `Sources (${lines.length}):`,
    ...lines,
  ]
    .filter((l) => l !== null)
    .join("\n");
  return { prompt, aliases, included };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type Cited = { sourceIds: string[] };
export type Analysis = {
  summary: string;
  keyFindings: (Cited & { text: string })[];
  companies: (Cited & {
    name: string;
    entityType: EntityType;
    typeEvidence: string | null;
    country: string | null;
    focus: string | null;
    domain: string | null;
  })[];
  developments: (Cited & { title: string; summary: string | null; date: string | null; company: string | null })[];
  trends: (Cited & { title: string; summary: string | null })[];
};

export type ValidationStats = {
  droppedItems: number; // items with no valid source IDs, or missing required text
  droppedCitations: number; // IDs that did not exist
  droppedWebsites: number; // websites not found in the sources
};

export class InvalidAnalysisError extends Error {}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function validDate(v: unknown, now: number): string | null {
  const s = text(v);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(t) || t > now + 24 * 60 * 60 * 1000 || new Date(t).toISOString().slice(0, 10) !== s) return null;
  return s;
}

// Whole-domain match: "ai.com" must not match inside "aimagazine.com".
function mentionsHost(haystack: string, host: string): boolean {
  const escaped = host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9-])${escaped}($|[^a-z0-9-])`, "i").test(haystack);
}

function bareHost(v: string): string | null {
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  return displayHost(withScheme);
}

// Parses and validates model output. Anything not backed by at least one
// real source is dropped; the result may therefore be smaller than what the
// model returned, but everything in it is traceable.
export function parseAnalysis(
  raw: string,
  aliases: Map<string, string>,
  sources: AnalysisSource[],
  now = Date.now(),
): { analysis: Analysis; stats: ValidationStats } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new InvalidAnalysisError("output was not valid JSON");
  }
  if (!data || typeof data !== "object") throw new InvalidAnalysisError("output was not an object");
  const d = data as Record<string, unknown>;
  const overview = (d.overview ?? {}) as Record<string, unknown>;

  const stats: ValidationStats = { droppedItems: 0, droppedCitations: 0, droppedWebsites: 0 };

  const cite = (v: unknown): string[] => {
    const out: string[] = [];
    for (const raw of arr(v)) {
      const alias = typeof raw === "string" ? raw.trim().toUpperCase().replace(/^SOURCE_?/, "S") : "";
      const id = aliases.get(alias);
      if (id) {
        if (!out.includes(id)) out.push(id);
      } else stats.droppedCitations++;
    }
    return out;
  };

  // Hosts and text the model saw, for checking claimed websites.
  const seen = sources.map((s) => `${displayHost(s.url) ?? ""} ${s.title ?? ""} ${s.snippet ?? ""}`.toLowerCase()).join("\n");

  function items<T>(v: unknown, limit: number, build: (item: Record<string, unknown>, sourceIds: string[]) => T | null) {
    const out: T[] = [];
    for (const item of arr(v)) {
      if (!item || typeof item !== "object") {
        stats.droppedItems++;
        continue;
      }
      const sourceIds = cite((item as Record<string, unknown>).source_ids);
      const built = sourceIds.length ? build(item as Record<string, unknown>, sourceIds) : null;
      if (built) out.push(built);
      else stats.droppedItems++;
      if (out.length === limit) break;
    }
    return out;
  }

  const summary = text(overview.summary);
  if (!summary) throw new InvalidAnalysisError("output had no overview summary");

  const keyFindings = items(overview.key_findings, LIMITS.keyFindings, (i, sourceIds) => {
    const t = text(i.text);
    return t ? { text: t, sourceIds } : null;
  });

  const companyNames = new Set<string>();
  const companies = items(d.companies, LIMITS.companies, (i, sourceIds) => {
    const name = text(i.name);
    if (!name || companyNames.has(name.toLowerCase())) return null;
    companyNames.add(name.toLowerCase());
    let domain: string | null = null;
    const website = text(i.website);
    if (website) {
      const host = bareHost(website);
      if (host && mentionsHost(seen, host)) domain = host;
      else stats.droppedWebsites++;
    }
    const entityType = ENTITY_TYPES.includes(i.entity_type as EntityType) ? (i.entity_type as EntityType) : "other";
    return { name, entityType, typeEvidence: text(i.type_evidence), country: text(i.country), focus: text(i.focus), domain, sourceIds };
  });

  const developments = items(d.recent_developments, LIMITS.developments, (i, sourceIds) => {
    const title = text(i.title);
    return title
      ? { title, summary: text(i.summary), date: validDate(i.date, now), company: text(i.company), sourceIds }
      : null;
  });

  // A trend is a recurring pattern: one source is not enough.
  const trends = items(d.emerging_trends, LIMITS.trends, (i, sourceIds) => {
    const title = text(i.title);
    return title && sourceIds.length >= 2 ? { title, summary: text(i.summary), sourceIds } : null;
  });

  return { analysis: { summary, keyFindings, companies, developments, trends }, stats };
}
