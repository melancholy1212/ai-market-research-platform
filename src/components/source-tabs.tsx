"use client";

import { useState } from "react";

import { SetAsideSources, SourceList, type Story } from "./source-list";

type Tab = "all" | "direct" | "contextual" | "unclassified" | "filtered";

// Relevance tabs over the source list. Citation numbers belong to the
// stories, so they stay the same whichever tab is open.
export function SourceTabs({
  direct,
  contextual,
  unclassified = [],
  filtered,
  aiOffTopic,
}: {
  direct: Story[];
  contextual: Story[];
  // Sources from research collected before relevance classification.
  unclassified?: Story[];
  filtered: Story[];
  aiOffTopic: string[];
}) {
  const [tab, setTab] = useState<Tab>("all");
  const offTopic = new Set(aiOffTopic);
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "all", label: "All", count: direct.length + contextual.length + unclassified.length + filtered.length },
    { id: "direct", label: "Direct", count: direct.length },
    { id: "contextual", label: "Contextual", count: contextual.length },
    // Only research collected before classification has these.
    ...(unclassified.length ? [{ id: "unclassified" as const, label: "Not classified", count: unclassified.length }] : []),
    { id: "filtered", label: "Filtered out", count: filtered.length },
  ];
  const shown =
    tab === "direct"
      ? direct
      : tab === "contextual"
        ? contextual
        : tab === "unclassified"
          ? unclassified
          : [...direct, ...contextual, ...unclassified];

  return (
    <div>
      <div role="tablist" aria-label="Filter sources by relevance" className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            disabled={t.count === 0 && t.id !== "all"}
            className={`-mb-px border-b-2 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
              tab === t.id ? "border-accent font-medium text-foreground" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label} <span className="tabular-nums text-muted">{t.count}</span>
          </button>
        ))}
      </div>
      <div className="mt-3">
        {tab === "filtered" ? (
          <SetAsideSources stories={filtered} aiOffTopic={offTopic} open />
        ) : (
          <>
            {shown.length > 0 ? (
              <SourceList stories={shown} />
            ) : (
              <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted">No sources here.</p>
            )}
            {tab === "all" && <SetAsideSources stories={filtered} aiOffTopic={offTopic} />}
          </>
        )}
      </div>
    </div>
  );
}
