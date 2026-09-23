-- Entity resolution runs between AI analysis and saving it; give it its own
-- status so the progress shown to users is accurate.
alter type public.research_status add value if not exists 'resolving' after 'analyzing';

-- Companies now carry resolution metadata (Wikidata id, confidence, signals,
-- website provenance), merged with the validated source ids.
create or replace function public.save_research_analysis(p_research_id uuid, p_analysis jsonb)
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
      as c(key text, name text, domain text, country text, description text, source_ids uuid[], metadata jsonb)
  loop
    insert into entities (research_id, name, entity_type, domain, country, description, metadata)
    values (
      p_research_id, company.name, 'company', company.domain, company.country, company.description,
      coalesce(company.metadata, '{}'::jsonb) || jsonb_build_object('source_ids', (
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

revoke execute on function public.save_research_analysis(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_research_analysis(uuid, jsonb) to service_role;
