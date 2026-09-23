"use client";

import { useMemo, useState } from "react";

import type { CitationTarget } from "./citations";

export type CompanyRow = {
  id: string;
  name: string;
  country: string | null;
  focus: string | null;
  domain: string | null;
  websiteLabel: string | null; // where the website came from
  identity: { kind: "verified" | "ambiguous" | "unverified" | null; href: string | null; title: string };
  citations: CitationTarget[];
};

type Sort = "cited" | "name" | "country";

function IdentityBadge({ identity }: { identity: CompanyRow["identity"] }) {
  if (!identity.kind) return null;
  if (identity.kind === "verified" && identity.href) {
    return (
      <a
        href={identity.href}
        target="_blank"
        rel="noopener noreferrer"
        title={identity.title}
        className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:underline dark:text-emerald-300"
      >
        Wikidata ✓
      </a>
    );
  }
  return (
    <span title={identity.title} className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-muted">
      {identity.kind === "ambiguous" ? "Ambiguous" : "Unverified"}
    </span>
  );
}

function CitationChips({ targets }: { targets: CitationTarget[] }) {
  return (
    <span className="inline-flex flex-wrap gap-0.5">
      {targets.map((t) => (
        <a
          key={t.number}
          href={`#${t.anchor}`}
          title={t.label}
          className="rounded bg-accent/10 px-1 font-mono text-[10px] leading-4 font-medium text-accent hover:bg-accent hover:text-accent-foreground"
        >
          {t.number}
        </a>
      ))}
    </span>
  );
}

// Searchable, sortable companies table. Rows arrive fully prepared from the
// server; this only filters and orders them.
export function CompaniesTable({ rows }: { rows: CompanyRow[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("cited");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter(
      (r) =>
        (!verifiedOnly || r.identity.kind === "verified") &&
        (!q || [r.name, r.country, r.focus, r.domain].some((f) => f?.toLowerCase().includes(q))),
    );
    const by = (f: (r: CompanyRow) => string) => (a: CompanyRow, b: CompanyRow) => f(a).localeCompare(f(b));
    return [...filtered].sort(
      sort === "name"
        ? by((r) => r.name)
        : sort === "country"
          ? (a, b) => by((r) => r.country ?? "￿")(a, b) || by((r) => r.name)(a, b)
          : (a, b) => b.citations.length - a.citations.length || by((r) => r.name)(a, b),
    );
  }, [rows, query, sort, verifiedOnly]);

  const verifiedCount = rows.filter((r) => r.identity.kind === "verified").length;

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter companies"
          aria-label="Filter companies"
          className="w-full min-w-0 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20 sm:w-auto sm:max-w-xs sm:flex-1"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort companies"
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="cited">Most cited</option>
          <option value="name">Name</option>
          <option value="country">Country</option>
        </select>
        {verifiedCount > 0 && (
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} className="accent-[var(--accent)]" />
            Verified only ({verifiedCount})
          </label>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted">No companies match.</p>
      ) : (
        <>
          {/* Phones: one card per company instead of a wide table. */}
          <ul className="divide-y divide-border sm:hidden">
            {visible.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span className="font-medium">{r.name}</span>
                  <IdentityBadge identity={r.identity} />
                </p>
                <p className="mt-0.5 text-sm text-muted">{[r.country, r.focus].filter(Boolean).join(" · ") || "—"}</p>
                <p className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                  {r.domain ? (
                    <a href={`https://${r.domain}`} target="_blank" rel="noopener noreferrer" title={r.websiteLabel ?? undefined} className="text-accent hover:underline">
                      {r.domain}
                    </a>
                  ) : (
                    <span className="text-muted">No website found</span>
                  )}
                  <CitationChips targets={r.citations} />
                </p>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="bg-surface-muted/50 text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Company</th>
                  <th className="px-4 py-2 font-medium">Country</th>
                  <th className="px-4 py-2 font-medium">Focus</th>
                  <th className="px-4 py-2 font-medium">Website</th>
                  <th className="px-4 py-2 font-medium">Sources</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-muted/40">
                    <td className="px-4 py-2.5">
                      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        <span className="font-medium">{r.name}</span>
                        <IdentityBadge identity={r.identity} />
                      </span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted">{r.country ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted">{r.focus ?? "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {r.domain ? (
                        <a
                          href={`https://${r.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={r.websiteLabel ?? undefined}
                          className="text-accent hover:underline"
                        >
                          {r.domain}
                        </a>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <CitationChips targets={r.citations} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
