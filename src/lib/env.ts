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
