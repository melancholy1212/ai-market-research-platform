-- Relevance filtering. Sources that are off-topic for the research question
-- are kept (for transparency) but set aside: they are not sent to the AI and
-- are listed separately. Null means "not scored" (research collected before
-- relevance filtering existed) and is treated as relevant.
alter table public.sources
  add column relevance_score real check (relevance_score is null or relevance_score between 0 and 1),
  add column is_relevant boolean;
