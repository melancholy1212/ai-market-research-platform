import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/env";
import type { Database } from "./database.types";

export type DbClient = SupabaseClient<Database>;

let client: DbClient | undefined;

// Service-role client for server code only (server components, route
// handlers, server actions). It bypasses row level security, so it must
// never be imported into client components — `server-only` enforces that
// at build time.
export function getSupabase(): DbClient {
  if (!client) {
    const { url, serviceRoleKey } = getSupabaseEnv();
    client = createClient<Database>(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
