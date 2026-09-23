import type { ResearchEvent } from "@/lib/research";

const LEVEL_DOT: Record<ResearchEvent["level"], string> = {
  info: "bg-sky-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
};

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "UTC",
});

export function ProgressLog({ events }: { events: ResearchEvent[] }) {
  return (
    <ol className="space-y-2">
      {events.map((event) => (
        <li key={event.id} className="flex items-start gap-3 text-sm">
          <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${LEVEL_DOT[event.level]}`} />
          <span className="min-w-0 flex-1">
            <span className="sr-only">{event.level}: </span>
            {event.message}
          </span>
          <time className="shrink-0 font-mono text-xs text-muted" dateTime={event.created_at}>
            {timeFormat.format(new Date(event.created_at))}
          </time>
        </li>
      ))}
    </ol>
  );
}
