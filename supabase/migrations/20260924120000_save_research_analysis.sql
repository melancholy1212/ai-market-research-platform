-- AI analysis persistence.

-- Which provider/model produced the report, token usage, and so on.
alter table public.reports
  add column metadata jsonb not null default '{}'::jsonb;

-- Saves a validated analysis in one transaction: companies (entities),
-- findings with their evidence links, and the report. Either all of it is
-- stored or none of it, so a failure never leaves half an analysis behind.
--
-- The app validates the payload first; this function re-checks the one rule
-- that matters most for trust: a finding can only cite sources that belong
-- to the same research. Citations to anything else are silently skipped.
--
-- Payload:
-- {
--   "report":    { "overview": text, "metadata": {} },
--   "companies": [ { "key": text, "name": text, "domain": text|null, "country": text|null,
--                    "description": text|null, "source_ids": [uuid] } ],
--   "findings":  [ { "type": text, "title": text, "summary": text|null, "occurred_at": timestamptz|null,
--                    "company_key": text|null, "source_ids": [uuid] } ]
-- }
create function public.save_research_analysis(p_research_id uuid, p_analysis jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  company record;
  finding record;
  entity_ids jsonb := '{}'::jsonb;
  new_id uuid;
  report_id uuid;
begin
  if exists (select 1 from reports where research_id = p_research_id) then
    raise exception 'research % already has an analysis', p_research_id using errcode = 'unique_violation';
  end if;

  for company in
    select * from jsonb_to_recordset(coalesce(p_analysis -> 'companies', '[]'::jsonb))
      as c(key text, name text, domain text, country text, description text, source_ids uuid[])
  loop
    insert into entities (research_id, name, entity_type, domain, country, description, metadata)
    values (
      p_research_id, company.name, 'company', company.domain, company.country, company.description,
      jsonb_build_object('source_ids', (
        select coalesce(jsonb_agg(s.id), '[]'::jsonb)
        from sources s where s.research_id = p_research_id and s.id = any (company.source_ids)
      ))
    )
    returning id into new_id;
    entity_ids := entity_ids || jsonb_build_object(company.key, new_id);
  end loop;

  for finding in
    select * from jsonb_to_recordset(coalesce(p_analysis -> 'findings', '[]'::jsonb))
      as f(type text, title text, summary text, occurred_at timestamptz, company_key text, source_ids uuid[])
  loop
    insert into findings (research_id, entity_id, type, title, summary, occurred_at)
    values (
      p_research_id, (entity_ids ->> finding.company_key)::uuid, finding.type, finding.title,
      finding.summary, finding.occurred_at
    )
    returning id into new_id;

    insert into finding_sources (finding_id, source_id)
    select new_id, s.id
    from sources s
    where s.research_id = p_research_id and s.id = any (finding.source_ids);
  end loop;

  insert into reports (research_id, overview, metadata)
  values (
    p_research_id,
    p_analysis -> 'report' ->> 'overview',
    coalesce(p_analysis -> 'report' -> 'metadata', '{}'::jsonb)
  )
  returning id into report_id;

  return report_id;
end;
$$;

-- Functions in public are executable by everyone by default and exposed over
-- the Data API. Only the server (service role) may call this one.
revoke execute on function public.save_research_analysis(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_research_analysis(uuid, jsonb) to service_role;
