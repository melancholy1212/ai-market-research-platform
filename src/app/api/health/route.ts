import { MissingEnvError } from "@/lib/env";
import { getSupabase } from "@/lib/supabase/server";

// Deployment check: confirms the app can reach Supabase and the schema exists.
// Reports only ok/error states, never configuration values.
export async function GET() {
  try {
    const { error } = await getSupabase()
      .from("researches")
      .select("id", { head: true, count: "exact" });
    if (error) {
      return Response.json({ status: "error", database: "unreachable" }, { status: 503 });
    }
    return Response.json({ status: "ok", database: "ok" });
  } catch (error) {
    const database = error instanceof MissingEnvError ? "not_configured" : "unreachable";
    return Response.json({ status: "error", database }, { status: 503 });
  }
}
