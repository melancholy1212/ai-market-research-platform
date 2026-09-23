import "server-only";

import { ProviderError } from "@/lib/http";
import { rssSearch } from "@/lib/providers/rss";
import { tavily } from "@/lib/providers/tavily";
import type { SearchProvider } from "@/lib/providers/types";
import type { EventLevel, Json, ResearchStatus } from "@/lib/supabase/database.types";
import { getSupabase } from "@/lib/supabase/server";

import { mergeCandidates, type MergeInput } from "./merge";
import { buildSearchPlan, type SearchTask } from "./plan";

const PROVIDERS: Record<string, SearchProvider> = { [tavily.id]: tavily, [rssSearch.id]: rssSearch };

// A failure whose message is written for the end user.
class RunError extends Error {}

function describeFailure(provider: SearchProvider, error: unknown): string {
  const name = provider.label;
  if (!(error instanceof ProviderError)) return `${name} failed unexpectedly.`;
  switch (error.kind) {
    case "rate_limited":
      return `${name} is rate-limiting requests right now.`;
    case "quota_exceeded":
      return `${name} has used up its search quota.`;
    case "unauthorized":
      return `${name} rejected the API key.`;
    case "timeout":
      return `${name} did not respond in time.`;
    case "network":
      return `${name} could not be reached.`;
    case "malformed":
      return `${name} returned a response that could not be read.`;
    case "http":
      return `${name} returned an error${error.status ? ` (HTTP ${error.status})` : ""}.`;
  }
}

function taskLabel(provider: SearchProvider, task: SearchTask): string {
  return provider.supports.length > 1 ? `${provider.label} (${task.request.type})` : provider.label;
}

// Runs the research pipeline for one research. Designed to be called in the
// background (after the response) and to never throw: every failure ends up
// as a `failed` status with a readable message.
export async function runResearch(researchId: string): Promise<void> {
  const supabase = getSupabase();
  const now = () => new Date().toISOString();

  // Claim the run: only a pending research can start, so a duplicate
  // trigger for the same research is a no-op.
  const { data: research, error: claimError } = await supabase
    .from("researches")
    .update({ status: "planning", updated_at: now() })
    .eq("id", researchId)
    .eq("status", "pending")
    .select("id, query, focus")
    .maybeSingle();
  if (claimError) {
    console.error(`runResearch ${researchId}: could not claim run`, claimError.message);
    return;
  }
  if (!research) return;

  async function log(stage: string, message: string, level: EventLevel = "info", metadata: Json = {}) {
    const { error } = await supabase
      .from("research_events")
      .insert({ research_id: researchId, stage, level, message, metadata });
    if (error) console.warn(`runResearch ${researchId}: event not saved`, error.message);
  }

  async function setStatus(status: ResearchStatus) {
    const { error } = await supabase
      .from("researches")
      .update({ status, updated_at: now() })
      .eq("id", researchId);
    if (error) throw new Error(`status update to ${status} failed: ${error.message}`);
  }

  try {
    // Planning
    await log("planning", "Planning searches for the research question.");
    const plan = buildSearchPlan(research);
    const runnable = plan.filter((task) => {
      const provider = PROVIDERS[task.providerId];
      return provider?.isConfigured();
    });
    const skippedProviders = new Set(
      plan.filter((t) => !runnable.includes(t)).map((t) => PROVIDERS[t.providerId]?.label ?? t.providerId),
    );
    for (const label of skippedProviders) {
      await log("planning", `${label} is not configured on this deployment, so it was skipped.`, "warning");
    }
    if (runnable.length === 0) throw new RunError("No data sources are configured on this deployment.");

    // Collecting: searches run concurrently; one failing does not stop the rest.
    await setStatus("collecting");
    await log("collecting", `Running ${runnable.length} searches.`);

    const outcomes = await Promise.all(
      runnable.map(async (task): Promise<MergeInput | null> => {
        const provider = PROVIDERS[task.providerId];
        const label = taskLabel(provider, task);
        const meta = { provider: provider.id, type: task.request.type, query: task.request.text };
        try {
          const { candidates, fromCache, warnings = [] } = await provider.search(task.request);
          for (const warning of warnings) await log("collecting", warning, "warning", meta);
          await log(
            "collecting",
            `${label}: ${candidates.length} result${candidates.length === 1 ? "" : "s"}${fromCache ? " (cached)" : ""}.`,
            "info",
            { ...meta, count: candidates.length, fromCache },
          );
          return { provider: provider.id, query: task.request.text, candidates };
        } catch (error) {
          console.warn(`runResearch ${researchId}: ${provider.id} ${task.request.type} failed`, error);
          const kind = error instanceof ProviderError ? error.kind : "unexpected";
          await log("collecting", `${describeFailure(provider, error)} Continuing without it.`, "warning", {
            ...meta,
            errorKind: kind,
          });
          return null;
        }
      }),
    );

    const succeeded = outcomes.filter((o): o is MergeInput => o !== null);
    if (succeeded.length === 0) {
      throw new RunError("None of the data sources could be reached. Please try again later.");
    }

    // Processing: URL normalization and exact-duplicate removal.
    await setStatus("processing");
    const { sources, stats } = mergeCandidates(succeeded);

    if (sources.length > 0) {
      const { error: insertError } = await supabase.from("sources").upsert(
        sources.map((s) => ({
          research_id: researchId,
          url: s.url,
          canonical_url: s.canonicalUrl,
          title: s.title,
          publisher: s.publisher,
          published_at: s.publishedAt,
          source_type: s.type,
          extracted_text: s.snippet,
          metadata: { found_by: s.foundBy },
        })),
        { onConflict: "research_id,canonical_url", ignoreDuplicates: true },
      );
      if (insertError) throw new Error(`saving sources failed: ${insertError.message}`);
    }

    const removed = [
      stats.duplicates && `${stats.duplicates} duplicate${stats.duplicates === 1 ? "" : "s"}`,
      stats.invalidUrls && `${stats.invalidUrls} unusable URL${stats.invalidUrls === 1 ? "" : "s"}`,
    ].filter(Boolean);
    await log(
      "processing",
      sources.length === 0
        ? "The searches returned no usable sources for this question."
        : `Kept ${sources.length} unique source${sources.length === 1 ? "" : "s"}${removed.length ? ` after removing ${removed.join(" and ")}` : ""}.`,
      sources.length === 0 ? "warning" : "info",
      stats,
    );

    const { error: completeError } = await supabase
      .from("researches")
      .update({ status: "completed", completed_at: now(), updated_at: now() })
      .eq("id", researchId);
    if (completeError) throw new Error(`completing run failed: ${completeError.message}`);
    await log("completed", "Source collection finished.");
  } catch (error) {
    console.error(`runResearch ${researchId} failed`, error);
    const message = error instanceof RunError ? error.message : "The research run failed unexpectedly.";
    const { error: failError } = await supabase
      .from("researches")
      .update({ status: "failed", error_message: message, completed_at: now(), updated_at: now() })
      .eq("id", researchId);
    if (failError) console.error(`runResearch ${researchId}: could not mark failed`, failError.message);
    await log("failed", message, "error");
  }

  // Housekeeping: drop expired cache rows. Best effort.
  const { error: cleanupError } = await supabase
    .from("provider_cache")
    .delete()
    .lt("expires_at", now());
  if (cleanupError) console.warn("provider_cache cleanup failed", cleanupError.message);
}
