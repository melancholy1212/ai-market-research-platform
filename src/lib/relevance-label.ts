// How a stored source's relevance is displayed. Sources collected before
// relevance classification existed have no label; they are shown as
// "unclassified", never as direct. A label-less source explicitly set aside
// by the earlier keyword filter (is_relevant = false) stays filtered out.
export type DisplayRelevance = "direct" | "contextual" | "irrelevant" | "unclassified";

export function displayRelevance(source: {
  relevance_label: "direct" | "contextual" | "irrelevant" | null;
  is_relevant: boolean | null;
}): DisplayRelevance {
  if (source.relevance_label) return source.relevance_label;
  return source.is_relevant === false ? "irrelevant" : "unclassified";
}
