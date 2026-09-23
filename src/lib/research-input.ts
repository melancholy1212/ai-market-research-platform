// Validation for the "new research" form. Pure and framework-free so it can
// run anywhere and be unit tested. Limits mirror the check constraints on
// public.researches, which remain the final guard.

export const QUERY_MIN_LENGTH = 3;
export const QUERY_MAX_LENGTH = 500;
export const FOCUS_MAX_LENGTH = 500;

export type ResearchInput = { query: string; focus: string | null };
export type ResearchInputErrors = Partial<Record<keyof ResearchInput, string>>;

export type ParseResult =
  | { ok: true; value: ResearchInput }
  | { ok: false; errors: ResearchInputErrors };

// Collapses whitespace runs (including newlines from the textarea) so that
// "cyber  startups\n" and "cyber startups" are stored identically.
function clean(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
}

// Postgres char_length counts code points; String#length counts UTF-16
// units. Count code points so the app and database agree.
function codePoints(s: string): number {
  return [...s].length;
}

export function parseResearchInput(raw: { query: unknown; focus: unknown }): ParseResult {
  const query = clean(raw.query);
  const focus = clean(raw.focus);
  const errors: ResearchInputErrors = {};

  if (codePoints(query) < QUERY_MIN_LENGTH) {
    errors.query = "Enter a research question.";
  } else if (codePoints(query) > QUERY_MAX_LENGTH) {
    errors.query = `Keep the question under ${QUERY_MAX_LENGTH} characters.`;
  }
  if (codePoints(focus) > FOCUS_MAX_LENGTH) {
    errors.focus = `Keep the focus under ${FOCUS_MAX_LENGTH} characters.`;
  }

  if (errors.query || errors.focus) return { ok: false, errors };
  return { ok: true, value: { query, focus: focus || null } };
}
