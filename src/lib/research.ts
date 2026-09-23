import "server-only";

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
