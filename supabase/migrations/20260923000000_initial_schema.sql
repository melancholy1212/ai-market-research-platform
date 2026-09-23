-- Initial schema for the AI Market Research Platform.
--
-- Data flow this schema is shaped around:
--   research question -> collected sources -> resolved entities
--   -> findings (each backed by one or more sources) -> report
--
-- Access model: every table has row level security enabled and no policies,
-- so the public (anon / publishable) key can read nothing. The app talks to
-- the database only from server code with the service-role key. Per-user
-- policies get added when Supabase Auth is introduced.

create type public.research_status as enum (
  'pending',
  'planning',
  'collecting',
  'processing',
  'analyzing',
  'completed',
  'failed'
);

-- ---------------------------------------------------------------------------
-- researches: one row per research question a user submits.
-- ---------------------------------------------------------------------------
create table public.researches (
  id            uuid primary key default gen_random_uuid(),
  -- Nullable until auth exists; single-user/demo mode leaves it empty.
  user_id       uuid references auth.users (id) on delete cascade,
  query         text not null check (char_length(btrim(query)) between 3 and 500),
  focus         text check (focus is null or char_length(focus) <= 500),
  status        public.research_status not null default 'pending',
  -- Human-readable reason shown in the UI when status = 'failed'.
  error_message text,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,

  constraint researches_completed_at_matches_status check (
    (status in ('completed', 'failed')) = (completed_at is not null)
  )
);

create index researches_created_at_idx on public.researches (created_at desc);
create index researches_user_id_created_at_idx on public.researches (user_id, created_at desc)
  where user_id is not null;

-- ---------------------------------------------------------------------------
-- sources: documents collected for a research run (articles, pages, API
-- records). canonical_url is the normalized URL computed in application code;
-- the unique constraint makes exact-URL deduplication a database guarantee.
-- ---------------------------------------------------------------------------
create table public.sources (
  id             uuid primary key default gen_random_uuid(),
  research_id    uuid not null references public.researches (id) on delete cascade,
  url            text not null,
  canonical_url  text not null,
  title          text,
  publisher      text,
  published_at   timestamptz,
  source_type    text not null,
  extracted_text text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),

  constraint sources_research_canonical_url_key unique (research_id, canonical_url)
);

create index sources_research_published_at_idx on public.sources (research_id, published_at desc nulls last);

-- ---------------------------------------------------------------------------
-- entities: organizations (mostly companies) resolved within a research run.
-- A registrable domain is treated as a strong identity signal, so it is unique
-- per research. Name alone is deliberately NOT unique: two different
-- organizations can share a name, and merging on name would be wrong.
-- ---------------------------------------------------------------------------
create table public.entities (
  id          uuid primary key default gen_random_uuid(),
  research_id uuid not null references public.researches (id) on delete cascade,
  name        text not null,
  entity_type text not null default 'company',
  domain      text check (domain is null or domain = lower(domain)),
  country     text,
  description text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index entities_research_id_idx on public.entities (research_id);
create unique index entities_research_domain_key on public.entities (research_id, domain)
  where domain is not null;

-- ---------------------------------------------------------------------------
-- findings: individual claims surfaced by the research (developments,
-- trends, facts). A finding may concern one entity, or none (e.g. a
-- market-wide trend).
-- ---------------------------------------------------------------------------
create table public.findings (
  id          uuid primary key default gen_random_uuid(),
  research_id uuid not null references public.researches (id) on delete cascade,
  entity_id   uuid references public.entities (id) on delete set null,
  type        text not null,
  title       text not null,
  summary     text,
  -- When the described event happened, if known. Distinct from the
  -- publication date of the sources that report it.
  occurred_at timestamptz,
  confidence  numeric(3, 2) check (confidence is null or confidence between 0 and 1),
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index findings_research_type_idx on public.findings (research_id, type);
create index findings_entity_id_idx on public.findings (entity_id) where entity_id is not null;

-- ---------------------------------------------------------------------------
-- finding_sources: the evidence link (finding -> source -> URL).
-- Many-to-many because the same development is often reported by several
-- outlets, and a trend is by definition supported by multiple sources.
-- ---------------------------------------------------------------------------
create table public.finding_sources (
  finding_id uuid not null references public.findings (id) on delete cascade,
  source_id  uuid not null references public.sources (id) on delete cascade,
  -- Optional supporting excerpt from the source text.
  excerpt    text,
  created_at timestamptz not null default now(),

  primary key (finding_id, source_id)
);

create index finding_sources_source_id_idx on public.finding_sources (source_id);

-- ---------------------------------------------------------------------------
-- reports: the synthesized narrative for a completed research run. One per
-- research. Trends and developments live in findings (so they stay linked to
-- sources); the report holds only the narrative layer on top of them.
-- ---------------------------------------------------------------------------
create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  research_id   uuid not null unique references public.researches (id) on delete cascade,
  overview      text not null,
  key_takeaways jsonb not null default '[]'::jsonb check (jsonb_typeof(key_takeaways) = 'array'),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row level security: on for everything, no policies yet (server-only access).
-- ---------------------------------------------------------------------------
alter table public.researches      enable row level security;
alter table public.sources         enable row level security;
alter table public.entities        enable row level security;
alter table public.findings        enable row level security;
alter table public.finding_sources enable row level security;
alter table public.reports         enable row level security;
