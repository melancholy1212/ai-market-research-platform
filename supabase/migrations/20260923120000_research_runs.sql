-- Support for executing research runs: progress tracking, a run event log
-- and a cache for external provider responses.

-- updated_at doubles as a heartbeat: the runner touches it at every stage,
-- so a non-terminal research whose updated_at is old has stopped running.
alter table public.researches
  add column updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- research_events: an append-only log of what a run did, shown to the user
-- as progress and kept for debugging. Messages are written by the app (never
-- raw provider error bodies), so they are safe to display.
-- ---------------------------------------------------------------------------
create table public.research_events (
  id          bigint generated always as identity primary key,
  research_id uuid not null references public.researches (id) on delete cascade,
  stage       text not null,
  level       text not null default 'info' check (level in ('info', 'warning', 'error')),
  message     text not null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index research_events_research_id_idx on public.research_events (research_id, id);

-- ---------------------------------------------------------------------------
-- provider_cache: responses from external providers keyed by a hash of the
-- normalized request, so identical searches within the TTL cost nothing.
-- Shared across research runs on purpose.
-- ---------------------------------------------------------------------------
create table public.provider_cache (
  provider   text not null,
  cache_key  text not null,
  response   jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,

  primary key (provider, cache_key)
);

create index provider_cache_expires_at_idx on public.provider_cache (expires_at);

alter table public.research_events enable row level security;
alter table public.provider_cache  enable row level security;
