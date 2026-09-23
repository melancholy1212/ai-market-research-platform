import type { ResearchStatus } from "@/lib/supabase/database.types";

const STATUS_STYLES: Record<ResearchStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-surface-muted text-muted" },
  planning: { label: "Planning", className: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  collecting: { label: "Collecting", className: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  processing: { label: "Processing", className: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  analyzing: { label: "Analyzing", className: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  completed: { label: "Completed", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  failed: { label: "Failed", className: "bg-red-500/10 text-red-700 dark:text-red-300" },
};

export function StatusBadge({ status }: { status: ResearchStatus }) {
  const { label, className } = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}
