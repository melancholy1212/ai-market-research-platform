import Link from "next/link";

import { formatRelative } from "@/lib/format";
import { isStale, type ResearchSummary } from "@/lib/research";

import { StatusBadge } from "./status-badge";

export function ResearchCard({ research }: { research: ResearchSummary }) {
  const status = isStale(research) ? "failed" : research.status;
  return (
    <Link
      href={`/research/${research.id}`}
      className="group flex flex-col rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent/50 hover:bg-surface-muted/30"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-balance group-hover:text-accent">{research.query}</p>
        <StatusBadge status={status} />
      </div>
      {research.focus && <p className="mt-0.5 truncate text-xs text-muted">{research.focus}</p>}
      <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-muted">
        {research.overview ?? (status === "completed" ? "Sources collected; no AI overview." : " ")}
      </p>
      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        <time dateTime={research.created_at}>{formatRelative(research.created_at)}</time>
        {research.sourceCount > 0 && <span>{research.sourceCount} sources</span>}
        {research.companyCount > 0 && <span>{research.companyCount} companies</span>}
      </p>
    </Link>
  );
}
