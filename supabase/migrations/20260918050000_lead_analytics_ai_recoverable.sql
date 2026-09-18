-- lead_analytics_action's "Qaytarilishi mumkin lost lidlar" list used to be
-- just the 20 most-recently-lost leads, with no actual assessment of
-- whether any of them can really be re-sold -- every lost lead showed up
-- there, forever, giving managers a stale to-do list with no signal. Now
-- filters to leads.recoverable = true (the AI call-analysis verdict added
-- by leads_ai_recoverable.sql + the audio-analytics.analyze.ts update
-- alongside it), adds the lead's expected_revenue and the AI's own reason
-- to the row, and returns a real recoverableCount/recoverableRevenue pair
-- for a "how much money is actually still winnable" stat card -- replacing
-- the old dashboard formula (lost-count * a flat 15% guess * avg deal
-- size), which had nothing to do with any individual lead's real chances.
drop function if exists public.lead_analytics_action(text, uuid, timestamptz, uuid);
create or replace function public.lead_analytics_action(
  p_funnel text default null,
  p_manager uuid default null,
  p_since timestamptz default null,
  p_team uuid default null
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org uuid := public.current_user_org_id();
  v_scope_owner_ids uuid[];
  v_total_leads int;
  v_won int;
  v_lost int;
  v_hot int;
  v_churn int;
  v_recoverable jsonb;
  v_recoverable_count int;
  v_recoverable_revenue numeric;
  v_hot_pipeline jsonb;
  v_operator_activity jsonb;
begin
  select case
    when public.current_user_role() in ('super_admin', 'platform_owner') then null::uuid[]
    when public.current_user_role() = 'rop' then (
      select array_agg(id) from public.profiles
      where id = auth.uid() or manager_id = auth.uid()
    )
    else array[auth.uid()]
  end into v_scope_owner_ids;

  select count(*) into v_total_leads
  from leads l
  where l.organization_id = v_org
    and (v_scope_owner_ids is null or l.owner_id = any(v_scope_owner_ids))
    and (p_funnel is null or l.funnel = p_funnel)
    and (p_manager is null or l.owner_id = p_manager)
    and (p_team is null or l.owner_id = p_team or l.owner_id in (select id from profiles where manager_id = p_team))
    and (p_since is null or l.created_at >= p_since);

  select
    count(*) filter (where s.is_won),
    count(*) filter (where s.is_lost)
  into v_won, v_lost
  from leads l
  join pipeline_stages s on s.id = l.stage_id
  where l.organization_id = v_org
    and (v_scope_owner_ids is null or l.owner_id = any(v_scope_owner_ids))
    and (p_funnel is null or l.funnel = p_funnel)
    and (p_manager is null or l.owner_id = p_manager)
    and (p_team is null or l.owner_id = p_team or l.owner_id in (select id from profiles where manager_id = p_team))
    and (p_since is null or l.created_at >= p_since);

  select count(*) into v_hot
  from leads l
  join pipeline_stages s on s.id = l.stage_id
  where l.organization_id = v_org
    and not s.is_won and not s.is_lost
    and l.temperature in ('Hot', 'VeryHot')
    and (v_scope_owner_ids is null or l.owner_id = any(v_scope_owner_ids))
    and (p_funnel is null or l.funnel = p_funnel)
    and (p_manager is null or l.owner_id = p_manager)
    and (p_team is null or l.owner_id = p_team or l.owner_id in (select id from profiles where manager_id = p_team))
    and (p_since is null or l.created_at >= p_since);

  select count(*) into v_churn
  from leads l
  join pipeline_stages s on s.id = l.stage_id
  where l.organization_id = v_org
    and not s.is_won and not s.is_lost
    and (l.last_contact_at is null or l.last_contact_at < now() - interval '7 days')
    and (v_scope_owner_ids is null or l.owner_id = any(v_scope_owner_ids))
    and (p_funnel is null or l.funnel = p_funnel)
    and (p_manager is null or l.owner_id = p_manager)
    and (p_team is null or l.owner_id = p_team or l.owner_id in (select id from profiles where manager_id = p_team))
    and (p_since is null or l.created_at >= p_since);

  select
    count(*),
    coalesce(sum(l.expected_revenue), 0)
  into v_recoverable_count, v_recoverable_revenue
  from leads l
  join pipeline_stages s on s.id = l.stage_id
  where l.organization_id = v_org
    and s.is_lost
    and l.recoverable is true
    and (v_scope_owner_ids is null or l.owner_id = any(v_scope_owner_ids))
    and (p_funnel is null or l.funnel = p_funnel)
    and (p_manager is null or l.owner_id = p_manager)
    and (p_team is null or l.owner_id = p_team or l.owner_id in (select id from profiles where manager_id = p_team))
    and (p_since is null or l.created_at >= p_since);

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_recoverable
  from (
    select
      l.id as lead_id,
      l.name,
      coalesce(p.full_name, '—') as manager,
      extract(day from now() - l.updated_at)::int as days_since_closed,
      l.next_follow_up,
      l.expected_revenue as value,
      l.recoverable_reason as reason
    from leads l
    join pipeline_stages s on s.id = l.stage_id
    left join profiles p on p.id = l.owner_id
    where l.organization_id = v_org
      and s.is_lost
      and l.recoverable is true
      and (v_scope_owner_ids is null or l.owner_id = any(v_scope_owner_ids))
      and (p_funnel is null or l.funnel = p_funnel)
      and (p_manager is null or l.owner_id = p_manager)
      and (p_team is null or l.owner_id = p_team or l.owner_id in (select id from profiles where manager_id = p_team))
      and (p_since is null or l.created_at >= p_since)
    order by l.updated_at desc
    limit 20
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_hot_pipeline
  from (
    select
      l.id as lead_id,
      l.name,
      coalesce(p.full_name, '—') as manager,
      l.score,
      l.temperature,
      s.name as stage,
      l.expected_revenue as value
    from leads l
    join pipeline_stages s on s.id = l.stage_id
    left join profiles p on p.id = l.owner_id
    where l.organization_id = v_org
      and not s.is_won and not s.is_lost
      and l.temperature in ('Hot', 'VeryHot')
      and (v_scope_owner_ids is null or l.owner_id = any(v_scope_owner_ids))
      and (p_funnel is null or l.funnel = p_funnel)
      and (p_manager is null or l.owner_id = p_manager)
      and (p_team is null or l.owner_id = p_team or l.owner_id in (select id from profiles where manager_id = p_team))
      and (p_since is null or l.created_at >= p_since)
    order by l.score desc, l.expected_revenue desc
    limit 20
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_operator_activity
  from (
    select
      coalesce(p.full_name, '—') as manager,
      count(*) filter (where s.is_won and c.connected) as won_connected,
      count(*) filter (where s.is_won and not c.connected) as won_attempts,
      count(*) filter (where s.is_lost and c.connected) as lost_connected,
      count(*) filter (where s.is_lost and not c.connected) as lost_attempts
    from amocrm_calls c
    join leads l on l.id = c.lead_id
    join pipeline_stages s on s.id = l.stage_id
    left join profiles p on p.id = l.owner_id
    where l.organization_id = v_org
      and c.occurred_at >= now() - interval '3 hours'
      and (s.is_won or s.is_lost)
      and (v_scope_owner_ids is null or l.owner_id = any(v_scope_owner_ids))
      and (p_funnel is null or l.funnel = p_funnel)
      and (p_manager is null or l.owner_id = p_manager)
      and (p_team is null or l.owner_id = p_team or l.owner_id in (select id from profiles where manager_id = p_team))
    group by coalesce(p.full_name, '—')
    order by count(*) desc
    limit 20
  ) t;

  return jsonb_build_object(
    'totalLeads', v_total_leads,
    'avgConversion', case when (v_won + v_lost) > 0 then round((v_won::numeric / (v_won + v_lost)) * 100, 1) else 0 end,
    'hotLeads', v_hot,
    'churnRisk', v_churn,
    'recoverable', v_recoverable,
    'recoverableCount', v_recoverable_count,
    'recoverableRevenue', v_recoverable_revenue,
    'hotPipeline', v_hot_pipeline,
    'operatorActivity', v_operator_activity
  );
end;
$$;
grant execute on function public.lead_analytics_action(text, uuid, timestamptz, uuid) to authenticated;
