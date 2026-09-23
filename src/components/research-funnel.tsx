export type FunnelStep = { label: string; value: number; hint: string };

// What the pipeline did, at a glance: results -> stories -> on topic -> companies.
export function ResearchFunnel({ steps }: { steps: FunnelStep[] }) {
  return (
    <dl
      className={`grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border ${steps.length === 5 ? "sm:grid-cols-5" : steps.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}
    >
      {steps.map((step, i) => (
        <div
          key={step.label}
          className={`relative bg-surface px-4 py-3 ${i === steps.length - 1 && steps.length % 2 === 1 ? "col-span-2 sm:col-span-1" : ""}`}
          title={step.hint}
        >
          <dt className="text-xs text-muted">{step.label}</dt>
          <dd className="mt-0.5 text-xl font-semibold tabular-nums tracking-tight">{step.value}</dd>
          {i < steps.length - 1 && (
            <span aria-hidden className="absolute top-1/2 -right-2 z-10 hidden -translate-y-1/2 text-muted sm:block">
              <svg viewBox="0 0 16 16" className="size-4 rounded-full bg-surface fill-none stroke-current" strokeWidth="1.5">
                <path d="m6 4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          )}
        </div>
      ))}
    </dl>
  );
}
