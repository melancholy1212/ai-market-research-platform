import "server-only";

import { AllProvidersFailedError, generateWithFallback } from "@/lib/ai/fallback";
import { aiProviders } from "@/lib/ai/providers";
import { resolveCompanies, type ResolvedCompany, type ResolutionStats } from "@/lib/entities";
import { ProviderError } from "@/lib/http";
import { rssSearch } from "@/lib/providers/rss";
import { tavily } from "@/lib/providers/tavily";
import type { SearchProvider } from "@/lib/providers/types";
import type { EventLevel, Json, ResearchStatus } from "@/lib/supabase/database.types";
import { RETRY_SAFE_HEADER } from "@/lib/supabase/retrying-fetch";
import { getSupabase } from "@/lib/supabase/server";

import {
  ANALYSIS_SCHEMA,
  ANALYSIS_SYSTEM,
  buildAnalysisPrompt,
  LIMITS,
  parseAnalysis,
  type Analysis,
  type AnalysisSource,
} from "./analysis";
import { groupStories, titleTokens } from "./dedup";
import { mergeCandidates, type MergeInput } from "./merge";
import { normalizeSources, type NormalizedSource } from "./normalize";
import { buildSearchPlan, type SearchTask } from "./plan";

const PROVIDERS: Record<string, SearchProvider> = { [tavily.id]: tavily, [rssSearch.id]: rssSearch };

// The most informative source of a story should be its primary: found by
// more searches, dated, with a snippet, then news before web.
function primaryFirst(a: NormalizedSource, b: NormalizedSource): number {
  return (
    b.foundBy.length - a.foundBy.length ||
    Number(Boolean(b.publishedAt)) - Number(Boolean(a.publishedAt)) ||
    Number(Boolean(b.snippet)) - Number(Boolean(a.snippet)) ||
    Number(b.type === "news") - Number(a.type === "news")
  );
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

const PROVIDER_NAMES: Record<string, string> = { gemini: "Gemini", groq: "Groq" };
const providerName = (id: string) => PROVIDER_NAMES[id] ?? id;

// Shapes a validated analysis into the payload save_research_analysis takes.
function analysisPayload(analysis: Analysis, companies: ResolvedCompany[], metadata: Json): Json {
  // Every name a company was merged from points at it, so developments that
  // mention "Navi Technologies" link to the "Navi" entity.
  const companyKeys = new Map(companies.flatMap((c, i) => c.names.map((n) => [n.toLowerCase(), `c${i}`] as const)));
  // The unique (research_id, domain) index allows one company per domain.
  const seenDomains = new Set<string>();
  return {
    report: { overview: analysis.summary, metadata },
    companies: companies.map((c, i) => {
      const domain = c.domain && !seenDomains.has(c.domain) ? c.domain : null;
      if (domain) seenDomains.add(domain);
      return {
        key: `c${i}`,
        name: c.name,
        domain,
        country: c.country,
        description: c.focus,
        source_ids: c.sourceIds,
        metadata: {
          names: c.names,
          website_source: domain ? c.websiteSource : null,
          resolution: {
            status: c.resolution.status,
            wikidata_id: c.resolution.wikidataId,
            wikidata_label: c.resolution.wikidataLabel,
            wikidata_description: c.resolution.wikidataDescription,
            confidence: c.resolution.confidence,
            signals: c.resolution.signals,
            reason: c.resolution.reason,
          },
        },
      };
    }),
    findings: [
      ...analysis.keyFindings.map((f) => ({ type: "key_finding", title: f.text, summary: null, occurred_at: null, company_key: null, source_ids: f.sourceIds })),
      ...analysis.developments.map((f) => ({
        type: "development",
        title: f.title,
        summary: f.summary,
        occurred_at: f.date,
        company_key: (f.company && companyKeys.get(f.company.toLowerCase())) ?? null,
        source_ids: f.sourceIds,
      })),
      ...analysis.trends.map((f) => ({ type: "trend", title: f.title, summary: f.summary, occurred_at: null, company_key: null, source_ids: f.sourceIds })),
    ],
  };
}

// Companies as extracted, marked unresolved: used when resolution fails.
function unresolvedCompanies(analysis: Analysis): ResolvedCompany[] {
  return analysis.companies.map((c) => ({
    ...c,
    names: [c.name],
    websiteSource: c.domain ? "sources" : null,
    resolution: {
      status: "unresolved",
      wikidataId: null,
      wikidataLabel: null,
      wikidataDescription: null,
      confidence: null,
      signals: [],
      reason: "resolution unavailable",
    },
  }));
}

function describeResolution(stats: ResolutionStats, total: number): string {
  const parts = [`${stats.resolved} of ${total} verified against Wikidata`];
  if (stats.merged) parts.push(`${plural(stats.merged, "duplicate")} merged`);
  const websites = stats.websites.sources + stats.websites.wikidata + stats.websites.search;
  if (websites) {
    const from = [
      stats.websites.sources && `${stats.websites.sources} from sources`,
      stats.websites.wikidata && `${stats.websites.wikidata} from Wikidata`,
      stats.websites.search && `${stats.websites.search} from web search`,
    ].filter(Boolean);
    parts.push(`${plural(websites, "website")} found (${from.join(", ")})`);
  }
  return `Companies: ${parts.join("; ")}.`;
}

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
      .insert({ research_id: researchId, stage, level, message, metadata })
      // A rare duplicate log line is better than a missing one.
      .setHeader(RETRY_SAFE_HEADER, "1");
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

    // Processing: exact duplicates (same URL), normalization, then story
    // grouping (same story, different URL).
    await setStatus("processing");
    const merged = mergeCandidates(succeeded);
    const normalized = normalizeSources(merged.sources);
    const ordered = [...normalized.sources].sort(primaryFirst);
    const groups = groupStories(ordered, titleTokens(`${research.query} ${research.focus ?? ""}`));

    const row = (s: NormalizedSource, extra: { duplicate_of?: string; dedup?: Json } = {}) => ({
      research_id: researchId,
      url: s.url,
      canonical_url: s.canonicalUrl,
      title: s.title,
      publisher: s.publisher,
      published_at: s.publishedAt,
      source_type: s.type,
      extracted_text: s.snippet,
      duplicate_of: extra.duplicate_of ?? null,
      metadata: {
        found_by: s.foundBy,
        ...(s.titleTruncated ? { title_truncated: true } : {}),
        ...(extra.dedup ? { dedup: extra.dedup } : {}),
      },
    });

    // Primaries first, so duplicates can reference their ids.
    const primaryIds = new Map<string, string>();
    if (groups.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from("sources")
        .upsert(
          groups.map((g) => row(g.primary)),
          { onConflict: "research_id,canonical_url", ignoreDuplicates: true },
        )
        .select("id, canonical_url");
      if (insertError) throw new Error(`saving sources failed: ${insertError.message}`);
      for (const r of inserted) primaryIds.set(r.canonical_url, r.id);
    }

    const duplicateRows = groups.flatMap((g) => {
      const primaryId = primaryIds.get(g.primary.canonicalUrl);
      return primaryId
        ? g.duplicates.map((d) =>
            row(d.source, { duplicate_of: primaryId, dedup: { reason: d.match.reason, similarity: d.match.similarity } }),
          )
        : [];
    });
    if (duplicateRows.length > 0) {
      const { error: dupError } = await supabase
        .from("sources")
        .upsert(duplicateRows, { onConflict: "research_id,canonical_url", ignoreDuplicates: true });
      if (dupError) throw new Error(`saving duplicate sources failed: ${dupError.message}`);
    }

    const total = normalized.sources.length;
    const grouped = duplicateRows.length;
    const removed = [
      merged.stats.duplicates && plural(merged.stats.duplicates, "repeated URL"),
      merged.stats.invalidUrls && plural(merged.stats.invalidUrls, "unusable URL"),
      normalized.stats.junk && plural(normalized.stats.junk, "unreadable page"),
    ].filter(Boolean);
    await log(
      "processing",
      total === 0
        ? "The searches returned no usable sources for this question."
        : `Kept ${plural(total, "source")}${removed.length ? ` after removing ${removed.join(", ")}` : ""}.`,
      total === 0 ? "warning" : "info",
      { ...merged.stats, ...normalized.stats },
    );
    if (grouped > 0) {
      const stories = groups.filter((g) => g.duplicates.length > 0).length;
      await log(
        "processing",
        `Found ${plural(stories, "story", "stories")} covered by more than one source (${plural(grouped, "additional report")} grouped).`,
        "info",
        { stories, grouped },
      );
    }

    // Analyzing: one AI call over the stored story primaries.
    const analysisSources: AnalysisSource[] = groups
      .filter((g) => primaryIds.has(g.primary.canonicalUrl))
      .slice(0, LIMITS.sources)
      .map((g) => ({
        id: primaryIds.get(g.primary.canonicalUrl)!,
        title: g.primary.title,
        url: g.primary.url,
        publisher: g.primary.publisher,
        publishedAt: g.primary.publishedAt,
        snippet: g.primary.snippet,
        alsoReportedBy: g.duplicates.length,
      }));
    const providers = aiProviders().filter((p) => p.isConfigured());

    if (analysisSources.length === 0) {
      await log("analyzing", "No sources to analyze.", "warning");
    } else if (providers.length === 0) {
      await log("analyzing", "No AI provider is configured on this deployment, so the sources were not analyzed.", "warning");
    } else {
      await setStatus("analyzing");
      await log("analyzing", `Analyzing ${plural(analysisSources.length, "source")} with AI.`);
      try {
        let sourcesAnalyzed = 0;
        const result = await generateWithFallback(providers, (provider) => {
          const { prompt, aliases, included } = buildAnalysisPrompt(research, analysisSources, provider.maxInputTokens);
          sourcesAnalyzed = included.length;
          return {
            request: { system: ANALYSIS_SYSTEM, prompt, schema: ANALYSIS_SCHEMA, schemaName: "research_analysis", maxOutputTokens: 8192 },
            parse: (text: string) => parseAnalysis(text, aliases, included),
          };
        });
        for (const attempt of result.failedAttempts) {
          await log(
            "analyzing",
            `${providerName(attempt.provider)} (${attempt.model}) could not complete the analysis (${attempt.error}); trying the next option.`,
            "warning",
            attempt,
          );
        }
        const { analysis, stats: validation } = result.value;

        const dropped = validation.droppedItems + validation.droppedWebsites;
        if (sourcesAnalyzed < analysisSources.length) {
          await log(
            "analyzing",
            `${providerName(result.provider)}'s free-tier limits fit ${sourcesAnalyzed} of ${analysisSources.length} sources; the most informative were used.`,
            "info",
          );
        }
        await log(
          "analyzing",
          `Analysis by ${providerName(result.provider)} (${result.model}): ${plural(analysis.companies.length, "company", "companies")}, ` +
            `${plural(analysis.developments.length, "development")}, ${plural(analysis.trends.length, "trend")}` +
            (dropped ? `. Discarded ${plural(dropped, "unsupported claim")}.` : "."),
          "info",
          { provider: result.provider, model: result.model, input_tokens: result.inputTokens, output_tokens: result.outputTokens, validation },
        );

        // Resolving: verify companies and find websites before saving, so
        // the analysis is stored in one transaction with resolved entities.
        let companies: ResolvedCompany[];
        let resolution: ResolutionStats | null = null;
        if (analysis.companies.length > 0) {
          await setStatus("resolving");
          try {
            ({ companies, stats: resolution } = await resolveCompanies(analysis.companies, `${research.query} ${research.focus ?? ""}`));
            await log("resolving", describeResolution(resolution, companies.length), "info", resolution);
            if (resolution.searchBlocked) {
              await log(
                "resolving",
                resolution.searchLookupsBy.tavily > 0
                  ? "DuckDuckGo is rate-limiting this server, so company websites were looked up with Tavily instead."
                  : "Web search for company websites is paused after hitting its rate limit; some websites may be missing.",
                resolution.searchLookupsBy.tavily > 0 ? "info" : "warning",
              );
            }
            if (resolution.wikidataErrors) {
              await log("resolving", "Some Wikidata lookups failed; those companies stay unverified.", "warning");
            }
          } catch (error) {
            console.error(`runResearch ${researchId}: entity resolution failed`, error);
            companies = unresolvedCompanies(analysis);
            await log("resolving", "Company verification failed; companies are shown unverified.", "warning");
          }
        } else {
          companies = [];
        }
        const metadata = {
          provider: result.provider,
          model: result.model,
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
          sources_analyzed: sourcesAnalyzed,
          validation,
          resolution,
        };
        const { error: saveError } = await supabase
          .rpc("save_research_analysis", { p_research_id: researchId, p_analysis: analysisPayload(analysis, companies, metadata) })
          // The function refuses a second save, so retrying is safe.
          .setHeader(RETRY_SAFE_HEADER, "1");
        if (saveError) throw new Error(`saving analysis failed: ${saveError.message}`);
      } catch (error) {
        // Analysis failing must not throw away the collected sources: the
        // research still completes, and the log says why there is no report.
        console.error(`runResearch ${researchId}: analysis failed`, error);
        const message =
          error instanceof AllProvidersFailedError
            ? `AI analysis is unavailable right now (${error.attempts.map((a) => `${providerName(a.provider)}: ${a.error}`).join("; ")}).`
            : "The AI analysis could not be saved.";
        await log("analyzing", `${message} The sources below were still collected.`, "warning", {
          attempts: error instanceof AllProvidersFailedError ? error.attempts : [],
        });
      }
    }

    const { error: completeError } = await supabase
      .from("researches")
      .update({ status: "completed", completed_at: now(), updated_at: now() })
      .eq("id", researchId);
    if (completeError) throw new Error(`completing run failed: ${completeError.message}`);
    await log("completed", "Research finished.");
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
