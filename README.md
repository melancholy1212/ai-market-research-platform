# AI Market Research Platform

Turns a natural-language market research question into a structured,
source-backed research report: companies, recent developments, and emerging
trends, with every finding traceable to the sources that support it.

> **Status: early development.** Research runs collect and store real sources
> from web and news search. Entity resolution and AI analysis are being built
> milestone by milestone. Nothing in the app is mocked: sections with no real
> data show empty states.

## Planned pipeline

```
question → plan → collect sources → normalize → deduplicate
        → resolve entities → filter for relevance → store
        → AI analysis → source-backed report → dashboard
```

The LLM is used only where language reasoning is needed (planning,
extraction, classification, synthesis). URL normalization, deduplication,
validation and storage are deterministic code.

## How a research run works today

Submitting a question creates a `pending` research and redirects to its page.
The run then executes in the background of that request (Next.js `after()`,
within Vercel's 300s function limit) and reports progress as it goes:

1. **Plan**: a fixed set of searches (web, news, and a focused web search
   when a focus is given).
2. **Collect**: searches run concurrently against each provider. Timeouts,
   rate limits, exhausted quotas and malformed responses are caught per
   search, logged in plain language, and the run continues with whatever
   succeeded. It fails only if every source fails.
3. **Process**: URLs are normalized (scheme, `www`, tracking parameters,
   trailing slashes, fragments) and exact duplicates are merged, keeping a
   record of every search that found each source.
4. **Store**: sources are upserted with a unique constraint on
   `(research_id, canonical_url)`, so duplicates cannot slip in.

Each stage writes to `research_events`, which the page shows as a live run
log. The page refreshes itself while the run is active.

**Providers** sit behind a small `SearchProvider` interface:

| Provider | Used for | Notes |
| --- | --- | --- |
| Tavily | Web and news search | Needs `TAVILY_API_KEY`; 1 credit per search |
| News site search | News from 7 curated outlets | Free, no key; WordPress search feeds (`/?s=<keywords>&feed=rss2`) |

The news-site search queries each outlet's WordPress search feed, which
returns full-text search results as RSS, often reaching back months. The
outlets (TechCrunch, Crunchbase News, EU-Startups, Inc42, Startup Daily,
TechCabal, SecurityWeek) were each checked by hand to return real,
topic-filtered results. Individual outlets failing is reported as a warning
in the run log; the search fails only if none can be read. GDELT was tried
first and dropped: it rate-limits shared IPs (including Vercel's) and
returned no results for typical queries.

**Caching**: raw provider responses are cached in Postgres
(`provider_cache`) keyed by a hash of the request, for 24h (web) or 6h
(news). Feeds are validated before caching, so a blocked or HTML response
is never cached. Raw responses are cached rather than parsed results, so parser fixes
apply to cached data immediately.

## Tech stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS 4), deployed on **Vercel**
- **Supabase** (PostgreSQL)
- **Claude** as the initial AI provider, behind a provider interface

## Project structure

```
src/
  app/                  routes: / (new research), /research (history),
                        /research/[id] (report), /api/health
  components/           shared UI
  lib/
    env.ts              server env handling
    research.ts         research queries
    pipeline/           run orchestration, search plan, candidate merge
    providers/          Tavily and news-site (RSS) search, provider cache
    http.ts             timeouts, retries, typed provider errors
    url.ts              URL normalization
    supabase/           server-only Supabase client + database types
supabase/migrations/    SQL schema
```

## Data model

| Table | Purpose |
| --- | --- |
| `researches` | One row per research question, with its processing status |
| `sources` | Collected documents; unique per research on normalized URL |
| `research_events` | Run log: what each stage did, including degraded sources |
| `provider_cache` | Cached raw responses from external providers |
| `entities` | Resolved organizations; unique per research on domain, never on name alone |
| `findings` | Developments, trends and facts, optionally tied to an entity |
| `finding_sources` | Evidence links: which sources support which finding |
| `reports` | Synthesized narrative (overview, key takeaways) for a research |

Row level security is enabled on every table with no policies. The public
Supabase key can read nothing, and all database access happens in server code.

## Local setup

Requires Node.js 20+ and a Supabase project.

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL and service-role key
```

Apply the schema by running
`supabase/migrations/20260923000000_initial_schema.sql` in the Supabase SQL
editor, or with the Supabase CLI:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Then:

```bash
npm run dev          # http://localhost:3000
npm test
npm run typecheck
npm run lint
npm run build
```

`GET /api/health` reports whether the app can reach the database.

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-only secret key. Never prefix with `NEXT_PUBLIC_` |
| `TAVILY_API_KEY` | no | Web/news search. Without it, runs use the news-site search only |
| `RESEARCH_HOURLY_LIMIT` | no | Research runs allowed per rolling hour, app-wide. Default 20 |
| `SUPABASE_DB_PASSWORD` | no | Used only by the Supabase CLI for `db push`; the app never reads it |

## Roadmap

1. ~~Application foundation~~
2. ~~Research creation and persistence~~
3. ~~Source discovery and ingestion~~
4. Normalization and deduplication
5. Entity resolution
6. Relevance filtering
7. AI analysis
8. Source-backed report generation
9. Dashboard polish
10. Deployment, testing and documentation
