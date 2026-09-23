import "server-only";

import { getResearchHourlyLimit } from "@/lib/env";
import type { ResearchInput } from "@/lib/research-input";
import type { Tables } from "@/lib/supabase/database.types";
import { getSupabase } from "@/lib/supabase/server";

export type Research = Tables<"researches">;

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
