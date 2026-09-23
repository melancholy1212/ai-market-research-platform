import { formatDate } from "@/lib/format";
import type { Source } from "@/lib/research";

const TYPE_LABEL: Record<string, string> = { news: "News", web: "Web" };

function foundByCount(source: Source): number {
  const foundBy = (source.metadata as { found_by?: unknown[] } | null)?.found_by;
  return Array.isArray(foundBy) ? foundBy.length : 0;
}

export function SourceList({ sources }: { sources: Source[] }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
      {sources.map((source) => {
        const hits = foundByCount(source);
        return (
          <li key={source.id} className="px-4 py-3.5">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium hover:text-accent hover:underline"
            >
              {source.title ?? source.canonical_url}
            </a>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span className="rounded bg-surface-muted px-1.5 py-0.5 font-medium">
                {TYPE_LABEL[source.source_type] ?? source.source_type}
              </span>
              {source.publisher && <span>{source.publisher}</span>}
              {source.published_at && (
                <time dateTime={source.published_at}>{formatDate(source.published_at)}</time>
              )}
              {hits > 1 && <span>Found by {hits} searches</span>}
            </p>
            {source.extracted_text && (
              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">{source.extracted_text}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
