"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const REPO_URL = "https://github.com/melancholy1212/ai-market-research-platform";

export function LogoMark({ className = "size-6" }: { className?: string }) {
  // Magnifier over stacked bars: research over data.
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <rect width="24" height="24" rx="6" className="fill-accent" />
      <path d="M6 16.5V13M9.5 16.5V9.5M13 16.5v-2.5" className="stroke-accent-foreground" strokeWidth="2" strokeLinecap="round" />
      <circle cx="15.5" cy="9" r="3" fill="none" className="stroke-accent-foreground" strokeWidth="1.8" />
      <path d="m17.7 11.2 2 2" className="stroke-accent-foreground" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-3 py-1.5 transition-colors ${
        active ? "bg-surface-muted font-medium text-foreground" : "text-muted hover:bg-surface-muted hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <LogoMark />
          <span className="hidden sm:inline">Market Research</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <NavLink href="/" active={pathname === "/"}>
            New research
          </NavLink>
          <NavLink href="/research" active={pathname.startsWith("/research")}>
            History
          </NavLink>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Source code on GitHub"
            className="ml-1 rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
          >
            <svg viewBox="0 0 16 16" aria-hidden className="size-5 fill-current">
              <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </a>
        </nav>
      </div>
    </header>
  );
}
