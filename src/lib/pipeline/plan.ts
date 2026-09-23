import type { SearchRequest } from "@/lib/providers/types";

export type SearchTask = {
  providerId: string;
  request: SearchRequest;
};

// Deterministic search plan for a research question. Planning moves to the
// LLM (subtopics, better queries) in the AI milestone; until then this is
// the fixed set of searches every research gets.
//
// Tavily costs 1 credit per search, so this plan costs 2-3 credits.
export function buildSearchPlan(research: { query: string; focus: string | null }): SearchTask[] {
  const tasks: SearchTask[] = [
    { providerId: "tavily", request: { text: research.query, type: "web", maxResults: 10 } },
    { providerId: "tavily", request: { text: research.query, type: "news", maxResults: 10 } },
    { providerId: "rss", request: { text: research.query, type: "news", maxResults: 40 } },
  ];
  if (research.focus) {
    tasks.push({
      providerId: "tavily",
      request: { text: `${research.query} ${research.focus}`, type: "web", maxResults: 10 },
    });
  }
  return tasks;
}
