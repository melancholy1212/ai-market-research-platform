import { formatDate } from "@/lib/format";
import type { Source } from "@/lib/research";

const TYPE_LABEL: Record<string, string> = { news: "News", web: "Web" };

function foundByCount(source: Source): number {
  const foundBy = (source.metadata as { found_by?: unknown[] } | null)?.found_by;
  return Array.isArray(foundBy) ? foundBy.length : 0;
}

export type Story = { primary: Source; alsoReported: Source[] };

// Groups sources by story: each primary with the duplicates that point at it.
// A duplicate whose primary is missing is shown as its own story.
export function groupSourcesByStory(sources: Source[]): Story[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const stories = new Map<string, Story>();
  for (const source of sources) {
    const primaryId = source.duplicate_of && byId.has(source.duplicate_of) ? source.duplicate_of : source.id;
    if (!stories.has(primaryId)) stories.set(primaryId, { primary: byId.get(primaryId)!, alsoReported: [] });
    if (primaryId !== source.id) stories.get(primaryId)!.alsoReported.push(source);
  }
  return [...stories.values()];
}

export const sourceAnchor = (id: string) => `source-${id}`;

export function SourceList({ stories }: { stories: Story[] }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
      {stories.map(({ primary, alsoReported }, i) => {
        const hits = foundByCount(primary);
        return (
          <li
            key={primary.id}
            id={sourceAnchor(primary.id)}
            className="flex scroll-mt-20 gap-3 px-4 py-3.5 target:bg-accent/10"
          >
            <span className="w-6 shrink-0 pt-0.5 text-right font-mono text-xs text-muted">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <a
                href={primary.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium hover:text-accent hover:underline"
              >
                {primary.title ?? primary.canonical_url}
              </a>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span className="rounded bg-surface-muted px-1.5 py-0.5 font-medium">
                  {TYPE_LABEL[primary.source_type] ?? primary.source_type}
                </span>
                {primary.publisher && <span>{primary.publisher}</span>}
                {primary.published_at && <time dateTime={primary.published_at}>{formatDate(primary.published_at)}</time>}
                {hits > 1 && <span>Found by {hits} searches</span>}
              </p>
              {primary.extracted_text && (
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">{primary.extracted_text}</p>
              )}
              {alsoReported.length > 0 && (
                <p className="mt-2 text-xs text-muted">
                  <span className="font-medium text-foreground">Also reported by </span>
                  {alsoReported.map((s, i) => (
                    <span key={s.id}>
                      {i > 0 && ", "}
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={s.title ?? undefined}
                        className="underline decoration-border underline-offset-2 hover:text-accent"
                      >
                        {s.publisher ?? s.canonical_url}
                      </a>
                    </span>
                  ))}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
