import { REPO_URL } from "./site-header";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>Source-backed market research. Every AI claim links to the sources it came from.</p>
        <p className="flex gap-4">
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
            Source on GitHub
          </a>
          <span>Next.js · Supabase · Gemini/Groq</span>
        </p>
      </div>
    </footer>
  );
}
