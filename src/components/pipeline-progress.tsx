import type { ResearchStatus } from "@/lib/supabase/database.types";

const STEPS: { status: ResearchStatus; label: string }[] = [
  { status: "planning", label: "Plan" },
  { status: "collecting", label: "Collect" },
  { status: "processing", label: "Clean & filter" },
  { status: "analyzing", label: "Analyze" },
  { status: "resolving", label: "Verify companies" },
];

// Live stepper for a running research, driven by the stored status.
export function PipelineProgress({ status }: { status: ResearchStatus }) {
  const current = status === "pending" ? -1 : STEPS.findIndex((s) => s.status === status);
  return (
    <ol className="grid grid-cols-5 gap-1.5" aria-label="Research progress">
      {STEPS.map((step, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        return (
          <li key={step.status} aria-current={state === "active" ? "step" : undefined}>
            <div
              className={`h-1.5 rounded-full ${
                state === "done" ? "bg-accent" : state === "active" ? "animate-pulse bg-accent/60" : "bg-surface-muted"
              }`}
            />
            <p className={`mt-1.5 truncate text-[11px] sm:text-xs ${state === "todo" ? "text-muted" : "font-medium"}`}>{step.label}</p>
          </li>
        );
      })}
    </ol>
  );
}
