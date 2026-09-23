import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span
            aria-hidden
            className="grid size-6 place-items-center rounded-md bg-accent text-xs font-bold text-accent-foreground"
          >
            MR
          </span>
          Market Research
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/"
            className="rounded-md px-3 py-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
          >
            New research
          </Link>
          <Link
            href="/research"
            className="rounded-md px-3 py-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
          >
            History
          </Link>
        </nav>
      </div>
    </header>
  );
}
