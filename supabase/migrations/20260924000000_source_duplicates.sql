-- Fuzzy duplicates: the same story reported under a different URL (another
-- outlet, a syndicated copy). Duplicates are kept as evidence, not deleted:
-- each points at the primary source of its story group.
alter table public.sources
  add column duplicate_of uuid references public.sources (id) on delete set null,
  add constraint sources_duplicate_of_not_self check (duplicate_of is null or duplicate_of <> id);

create index sources_duplicate_of_idx on public.sources (duplicate_of) where duplicate_of is not null;
