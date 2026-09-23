export type CitationTarget = { number: number; anchor: string; label: string };

// Numbered source references for a claim, e.g. [1][4]. Each links to the
// source in the list below; duplicates of a story share its number.
export function Citations({ ids, index }: { ids: string[]; index: Map<string, CitationTarget> }) {
  const targets = [...new Map(ids.flatMap((id) => (index.has(id) ? [[index.get(id)!.number, index.get(id)!]] : []))).values()].sort(
    (a, b) => a.number - b.number,
  );
  if (targets.length === 0) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-0.5 align-baseline">
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
