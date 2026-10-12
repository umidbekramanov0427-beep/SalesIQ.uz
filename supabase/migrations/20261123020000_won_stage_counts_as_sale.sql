-- A funnel's won stage counts as a sale whatever it is called.
--
-- "Sales" / late-funnel conversion matched stage names only (predoplata,
-- yarim, toliq, won, успешно, rop closed). A company whose won stage is
-- called "Sotildi" or "Muvaffaqiyatli" got 0 sales for every manager in
-- Reyting and 0% conversion on the Voronkalar cards. The app now treats
-- the won stage (pipeline_stages.is_won) as a sale too; these two list
-- functions do the same. Nothing else in them changes.

create or replace function public.funnel_list_stats()
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
  conn as (
    select enabled_pipeline_ids
    from public.amocrm_connection
    where organization_id = public.current_user_org_id()
  ),
  pipeline_map as (
    select distinct on (pipeline_name) pipeline_name, amocrm_pipeline_id
    from public.pipeline_stages
    where pipeline_name is not null and amocrm_pipeline_id is not null
    order by pipeline_name, amocrm_pipeline_id
  )
  select
    coalesce(nullif(l.funnel, ''), 'Direct Sales') as funnel,
    count(*) as total,
    coalesce(sum(l.expected_revenue), 0) as value,
    count(*) filter (where ps.is_won) as won,
    count(*) filter (
      where ps.is_won
        or regexp_replace(lower(ps.name), '[''’ʼ`]', '', 'g')
          ~ '(predoplata|peredoplata|yarim|toliq|won|успешно|rop closed)'
    ) as late_funnel,
    count(*) filter (where l.temperature in ('Hot', 'VeryHot')) as hot,
    count(*) filter (where l.temperature = 'Warm') as warm,
    count(*) filter (where l.temperature = 'Cold') as cold
  from public.leads l
  cross join scope
  left join conn on true
  left join pipeline_map pm on pm.pipeline_name = l.funnel
  left join public.pipeline_stages ps on ps.id = l.stage_id
  where l.organization_id = public.current_user_org_id()
    and (scope.owner_ids is null or l.owner_id = any(scope.owner_ids))
    and (
      conn.enabled_pipeline_ids is null
      or pm.amocrm_pipeline_id is null
      or pm.amocrm_pipeline_id = any(conn.enabled_pipeline_ids)
    )
  group by 1;
$$;

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
        where ps.is_won
          or regexp_replace(lower(ps.name), '[''’ʼ`]', '', 'g')
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

notify pgrst, 'reload schema';
