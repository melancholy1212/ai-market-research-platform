# AI Market Research Platform

Turns a natural-language market research question into a structured,
source-backed research report: companies, recent developments, and emerging
trends, with every finding traceable to the sources that support it.

> **Status: early development.** The application foundation (routes, database
> schema, Supabase connection) is in place. The research pipeline is being
> built milestone by milestone. Nothing in the app is mocked: sections with no
> real data show empty states.

## Planned pipeline

```
question → plan → collect sources → normalize → deduplicate
        → resolve entities → filter for relevance → store
        → AI analysis → source-backed report → dashboard
```

The LLM is used only where language reasoning is needed (planning,
extraction, classification, synthesis). URL normalization, deduplication,
validation and storage are deterministic code.

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
    supabase/           server-only Supabase client + database types
supabase/migrations/    SQL schema
```

## Data model

| Table | Purpose |
| --- | --- |
| `researches` | One row per research question, with its processing status |
| `sources` | Collected documents; unique per research on normalized URL |
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
| `SUPABASE_DB_PASSWORD` | no | Used only by the Supabase CLI for `db push`; the app never reads it |

## Roadmap

1. ~~Application foundation~~
2. Research creation and persistence
3. Source discovery and ingestion
4. Normalization and deduplication
5. Entity resolution
6. Relevance filtering
7. AI analysis
8. Source-backed report generation
9. Dashboard polish
10. Deployment, testing and documentation
