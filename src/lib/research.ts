import "server-only";

import { getResearchHourlyLimit } from "@/lib/env";
import type { ResearchInput } from "@/lib/research-input";
import type { Tables } from "@/lib/supabase/database.types";
import { getSupabase } from "@/lib/supabase/server";

export type Research = Tables<"researches">;
export type Source = Tables<"sources">;
export type ResearchEvent = Tables<"research_events">;

// A run can't outlive the function's 300s limit, so a non-terminal research
// untouched for longer than this was interrupted (crash, deploy, timeout).
const STALE_AFTER_MS = 6 * 60 * 1000;

export function isStale(research: Research, now = Date.now()): boolean {
  if (research.status === "completed" || research.status === "failed") return false;
  if (research.status === "pending") return now - Date.parse(research.created_at) > STALE_AFTER_MS;
  return now - Date.parse(research.updated_at) > STALE_AFTER_MS;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listResearches(limit = 50): Promise<Research[]> {
  const { data, error } = await getSupabase()
    .from("researches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load research history: ${error.message}`);
  return data;
}

// Returns null both for unknown ids and for strings that are not UUIDs, so
// malformed URLs render a 404 instead of a Postgres cast error.
export async function getResearch(id: string): Promise<Research | null> {
  if (!UUID_RE.test(id)) return null;

  const { data, error } = await getSupabase()
    .from("researches")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load research: ${error.message}`);
  return data;
}

export type CreateResearchResult =
  | { ok: true; id: string }
  | { ok: false; reason: "rate_limited" };

// Inserts a new research in `pending` state. The hourly cap is a count
// query, not a lock: two simultaneous requests can both pass at the limit.
// That slack is acceptable for cost control on a demo.
export async function createResearch(input: ResearchInput): Promise<CreateResearchResult> {
  const supabase = getSupabase();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error: countError } = await supabase
    .from("researches")
    .select("id", { head: true, count: "exact" })
    .gte("created_at", since);
  if (countError) throw new Error(`Failed to check research rate limit: ${countError.message}`);
  if ((count ?? 0) >= getResearchHourlyLimit()) return { ok: false, reason: "rate_limited" };

  const { data, error } = await supabase
    .from("researches")
    .insert({ query: input.query, focus: input.focus })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to create research: ${error.message}`);
  return { ok: true, id: data.id };
}

export async function listSources(researchId: string): Promise<Source[]> {
  const { data, error } = await getSupabase()
    .from("sources")
    .select("*")
    .eq("research_id", researchId)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to load sources: ${error.message}`);
  return data;
}

export async function listEvents(researchId: string): Promise<ResearchEvent[]> {
  const { data, error } = await getSupabase()
    .from("research_events")
    .select("*")
    .eq("research_id", researchId)
    .order("id", { ascending: true });
  if (error) throw new Error(`Failed to load research progress: ${error.message}`);
  return data;
}

export type Report = Tables<"reports">;
export type Entity = Tables<"entities">;
export type Finding = Tables<"findings"> & { sourceIds: string[] };

export type ResearchAnalysis = {
  report: Report | null;
  companies: Entity[];
  findings: Finding[];
};

export async function getAnalysis(researchId: string): Promise<ResearchAnalysis> {
  const supabase = getSupabase();
  const [report, entities, findings] = await Promise.all([
    supabase.from("reports").select("*").eq("research_id", researchId).maybeSingle(),
    supabase.from("entities").select("*").eq("research_id", researchId).order("created_at"),
    supabase
      .from("findings")
      .select("*, finding_sources(source_id)")
      .eq("research_id", researchId)
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .order("created_at"),
  ]);
  const error = report.error ?? entities.error ?? findings.error;
  if (error) throw new Error(`Failed to load analysis: ${error.message}`);

  return {
    report: report.data,
    companies: entities.data ?? [],
    findings: (findings.data ?? []).map(({ finding_sources, ...f }) => ({
      ...f,
      sourceIds: (finding_sources ?? []).map((fs) => fs.source_id),
    })),
  };
}

// Source ids a company was cited with (stored on the entity by the analysis).
export function entitySourceIds(entity: Entity): string[] {
  const ids = (entity.metadata as { source_ids?: unknown } | null)?.source_ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

export type EntityResolution = {
  status: "resolved" | "ambiguous" | "unresolved";
  wikidataId: string | null;
  wikidataLabel: string | null;
  wikidataDescription: string | null;
  confidence: number | null;
  signals: string[];
  reason: string | null;
  websiteSource: "sources" | "wikidata" | "search" | null;
};

// Resolution details stored on the entity; null for entities saved before
// resolution existed.
export function entityResolution(entity: Entity): EntityResolution | null {
  const m = (entity.metadata ?? {}) as Record<string, unknown>;
  const r = m.resolution as Record<string, unknown> | undefined;
  if (!r || typeof r.status !== "string") return null;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    status: r.status as EntityResolution["status"],
    wikidataId: str(r.wikidata_id),
    wikidataLabel: str(r.wikidata_label),
    wikidataDescription: str(r.wikidata_description),
    confidence: typeof r.confidence === "number" ? r.confidence : null,
    signals: Array.isArray(r.signals) ? r.signals.filter((x): x is string => typeof x === "string") : [],
    reason: str(r.reason),
    websiteSource: str(m.website_source) as EntityResolution["websiteSource"],
  };
}
