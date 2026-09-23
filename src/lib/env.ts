import "server-only";

// Server-side configuration. Values are read lazily so a missing variable
// surfaces as a clear message on the page that needs it, instead of
// crashing the whole app at import time.

export class MissingEnvError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Missing required environment variables: ${missing.join(", ")}`);
    this.name = "MissingEnvError";
  }
}

export function getSupabaseEnv() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing = [
    !url && "SUPABASE_URL",
    !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter((name): name is string => Boolean(name));

  if (missing.length > 0) throw new MissingEnvError(missing);

  return { url: url!, serviceRoleKey: serviceRoleKey! };
}

// Cap on research runs created per rolling hour across the whole app. The
// public demo has no accounts, so this is what stops one visitor from
// running up external API and LLM costs.
export function getResearchHourlyLimit(): number {
  const raw = process.env.RESEARCH_HOURLY_LIMIT;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 20;
}
