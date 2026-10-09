-- The CRM section (Voronkalar) shows only the platform's own CRM: its own
-- funnels and the leads created in it. Leads, stages and funnels synced from
-- amoCRM or Bitrix24 stay in the database for analytics (Reyting, Lead
-- analytics, Dashboard...) and never appear in the CRM.
--
-- Same numbers as funnel_list_stats(), for native leads only, and listing a
-- native funnel even before its first lead.
create or replace function public.crm_funnel_list_stats()
returns table (funnel text, total bigint, value numeric, won bigint, late_funnel bigint, hot bigint, warm bigint, cold bigint)
language sql
stable
set search_path to 'public'
as $$
  with scope as (
    select case
      when public.current_user_role() in ('super_admin', 'platform_owner') then null::uuid[]
      when public.current_user_role() = 'rop' then (
        select array_agg(id) from public.profiles
        where id = auth.uid() or manager_id = auth.uid()
      )
      else array[auth.uid()]
    end as owner_ids
  ),
  native_funnels as (
    select distinct coalesce(nullif(ps.pipeline_name, ''), 'Direct Sales') as funnel
    from public.pipeline_stages ps
    where ps.organization_id = public.current_user_org_id()
      and ps.amocrm_pipeline_id is null
      and ps.bitrix24_category_id is null
  ),
  stats as (
    select
      coalesce(nullif(l.funnel, ''), 'Direct Sales') as funnel,
      count(*) as total,
      coalesce(sum(l.expected_revenue), 0) as value,
      count(*) filter (where ps.is_won) as won,
      count(*) filter (
        where regexp_replace(lower(ps.name), '[''’ʼ`]', '', 'g')
          ~ '(predoplata|peredoplata|yarim|toliq|won|успешно|rop closed)'
      ) as late_funnel,
      count(*) filter (where l.temperature in ('Hot', 'VeryHot')) as hot,
      count(*) filter (where l.temperature = 'Warm') as warm,
      count(*) filter (where l.temperature = 'Cold') as cold
    from public.leads l
    cross join scope
    left join public.pipeline_stages ps on ps.id = l.stage_id
    where l.organization_id = public.current_user_org_id()
      and l.amocrm_id is null
      and l.bitrix24_deal_id is null
      and (scope.owner_ids is null or l.owner_id = any(scope.owner_ids))
    group by 1
  )
  select f.funnel,
         coalesce(s.total, 0),
         coalesce(s.value, 0),
         coalesce(s.won, 0),
         coalesce(s.late_funnel, 0),
         coalesce(s.hot, 0),
         coalesce(s.warm, 0),
         coalesce(s.cold, 0)
  from (select funnel from native_funnels union select funnel from stats) f
  left join stats s on s.funnel = f.funnel;
$$;

grant execute on function public.crm_funnel_list_stats() to authenticated;

-- The CRM's lead list header numbers, for native leads only.
create or replace function public.crm_leads_list_stats(p_search text, p_stage_id uuid)
returns table (total bigint, hot bigint, avg_score numeric, revenue numeric)
language sql
stable
set search_path to 'public'
as $$
  with scope as (
    select case
      when public.current_user_role() in ('super_admin', 'platform_owner') then null::uuid[]
      when public.current_user_role() = 'rop' then (
        select array_agg(id) from public.profiles
        where id = auth.uid() or manager_id = auth.uid()
      )
      else array[auth.uid()]
    end as owner_ids
  )
  select count(*),
         count(*) filter (where l.temperature in ('Hot', 'VeryHot')),
         coalesce(avg(l.score), 0),
         coalesce(sum(l.expected_revenue), 0)
  from public.leads l
  cross join scope
  where l.organization_id = public.current_user_org_id()
    and l.amocrm_id is null
    and l.bitrix24_deal_id is null
    and (scope.owner_ids is null or l.owner_id = any(scope.owner_ids))
    and (p_stage_id is null or l.stage_id = p_stage_id)
    and (p_search is null or l.name ilike '%' || p_search || '%' or l.company_name ilike '%' || p_search || '%');
$$;

grant execute on function public.crm_leads_list_stats(text, uuid) to authenticated;

notify pgrst, 'reload schema';
