-- Home / Konversiya / Reyting / Audio numbers grouped by the database.
--
-- In a load test with 50,000 leads and 100,000 calls (one 60-person
-- company) these widgets downloaded every lead and call of the period into
-- the browser and added them up there: the home page moved 26 MB in 127
-- requests, the Konversiya tab 38 MB and 25 s. These functions return the
-- same numbers already grouped -- a few hundred small rows.
--
-- All are security invoker: the caller's own RLS on leads / amocrm_calls
-- still applies, and each also pins organization_id to the caller's org.
-- p_owner_ids narrows to some lead owners (a team, one manager, or what a
-- ROP may see); null means everyone the caller can see.

-- Leads created in [p_from, p_to): per (owner, stage) and per (stage, day);
-- and in [p_prev_from, p_prev_to): per stage. "period" says which.
create or replace function public.period_lead_summary(
  p_from timestamptz,
  p_to timestamptz,
  p_prev_from timestamptz default null,
  p_prev_to timestamptz default null,
  p_funnel text default null,
  p_owner_ids uuid[] default null,
  p_tz text default 'UTC'
)
returns table (period text, owner_id uuid, stage_id uuid, day date, n bigint, revenue numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select l.owner_id, l.stage_id, l.created_at, coalesce(l.expected_revenue, 0) as revenue
    from public.leads l
    where l.organization_id = public.current_user_org_id()
      and l.owner_id is not null
      and (p_funnel is null or coalesce(nullif(l.funnel, ''), 'Direct Sales') = p_funnel)
      and (p_owner_ids is null or l.owner_id = any (p_owner_ids))
  ),
  cur as (select * from base where created_at >= p_from and created_at < p_to),
  prev as (
    select * from base
    where p_prev_from is not null and created_at >= p_prev_from and created_at < p_prev_to
  )
  select 'owner', c.owner_id, c.stage_id, null::date, count(*), sum(c.revenue)
  from cur c group by c.owner_id, c.stage_id
  union all
  select 'day', null, c.stage_id, (c.created_at at time zone p_tz)::date, count(*), sum(c.revenue)
  from cur c group by c.stage_id, (c.created_at at time zone p_tz)::date
  union all
  select 'prev', null, p.stage_id, null::date, count(*), sum(p.revenue)
  from prev p group by p.stage_id;
$$;

-- Calls in [p_from, p_to) on leads (with an owner): totals, per owner,
-- per day, and how many distinct leads had a connected call / are won.
create or replace function public.period_call_summary(
  p_from timestamptz,
  p_to timestamptz,
  p_funnel text default null,
  p_owner_ids uuid[] default null,
  p_tz text default 'UTC'
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with c as (
    select c.lead_id, c.connected, c.duration_seconds, c.score, c.occurred_at,
           l.owner_id, l.stage_id
    from public.amocrm_calls c
    join public.leads l on l.id = c.lead_id
    where c.organization_id = public.current_user_org_id()
      and c.occurred_at >= p_from and c.occurred_at < p_to
      and l.owner_id is not null
      and (p_funnel is null or coalesce(nullif(l.funnel, ''), 'Direct Sales') = p_funnel)
      and (p_owner_ids is null or l.owner_id = any (p_owner_ids))
  )
  select jsonb_build_object(
    'total', (select count(*) from c),
    'connected', (select count(*) from c where c.connected),
    'seconds', (select coalesce(sum(c.duration_seconds), 0) from c),
    'scored', (select count(c.score) from c),
    'score_sum', (select coalesce(sum(c.score), 0) from c),
    'connected_leads', (select count(distinct c.lead_id) from c where c.connected),
    'won_connected_leads', (
      select count(distinct c.lead_id)
      from c join public.pipeline_stages s on s.id = c.stage_id and s.is_won
      where c.connected
    ),
    'by_owner', coalesce((
      select jsonb_agg(jsonb_build_object(
        'owner_id', x.owner_id, 'calls', x.n, 'seconds', x.secs, 'scored', x.sc, 'score_sum', x.ss))
      from (
        select c.owner_id, count(*) as n, coalesce(sum(c.duration_seconds), 0) as secs,
               count(c.score) as sc, coalesce(sum(c.score), 0) as ss
        from c group by c.owner_id
      ) x
    ), '[]'::jsonb),
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', y.d, 'connected', y.cn, 'missed', y.ms))
      from (
        select (c.occurred_at at time zone p_tz)::date as d,
               count(*) filter (where c.connected) as cn,
               count(*) filter (where not c.connected) as ms
        from c group by 1
      ) y
    ), '[]'::jsonb)
  );
$$;

-- Scored calls per day since p_from, and how many scored within
-- [p_score_min, p_score_max] (the Konversiya tab's quality line).
create or replace function public.call_quality_by_day(
  p_from timestamptz,
  p_score_min int,
  p_score_max int,
  p_funnel text default null,
  p_owner_ids uuid[] default null,
  p_tz text default 'UTC'
)
returns table (day date, scored bigint, in_range bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select (c.occurred_at at time zone p_tz)::date,
         count(*),
         count(*) filter (where c.score between p_score_min and p_score_max)
  from public.amocrm_calls c
  join public.leads l on l.id = c.lead_id
  where c.organization_id = public.current_user_org_id()
    and c.occurred_at >= p_from
    and c.score is not null
    and l.owner_id is not null
    and (p_funnel is null or coalesce(nullif(l.funnel, ''), 'Direct Sales') = p_funnel)
    and (p_owner_ids is null or l.owner_id = any (p_owner_ids))
  group by 1;
$$;

-- Revenue of won leads per month (by creation month), since p_from.
create or replace function public.won_revenue_by_month(
  p_from timestamptz,
  p_funnel text default null,
  p_owner_ids uuid[] default null,
  p_tz text default 'UTC'
)
returns table (month date, revenue numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select date_trunc('month', l.created_at at time zone p_tz)::date,
         coalesce(sum(l.expected_revenue), 0)
  from public.leads l
  join public.pipeline_stages s on s.id = l.stage_id and s.is_won
  where l.organization_id = public.current_user_org_id()
    and l.created_at >= p_from
    and l.owner_id is not null
    and (p_funnel is null or coalesce(nullif(l.funnel, ''), 'Direct Sales') = p_funnel)
    and (p_owner_ids is null or l.owner_id = any (p_owner_ids))
  group by 1;
$$;

-- Calls per hour of the day (in p_tz) in [p_from, p_to): how many, and how
-- many connected (Audio tahlil's "best hour to call"). With p_owner_ids only
-- calls on those owners' leads count.
create or replace function public.call_pickup_by_hour(
  p_from timestamptz,
  p_to timestamptz,
  p_owner_ids uuid[] default null,
  p_tz text default 'UTC'
)
returns table (hour int, total bigint, connected bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select extract(hour from c.occurred_at at time zone p_tz)::int,
         count(*),
         count(*) filter (where c.connected)
  from public.amocrm_calls c
  left join public.leads l on l.id = c.lead_id
  where c.organization_id = public.current_user_org_id()
    and c.occurred_at >= p_from and c.occurred_at < p_to
    and (p_owner_ids is null or l.owner_id = any (p_owner_ids))
  group by 1;
$$;

-- Reyting's per-manager totals: leads created in [p_from, p_to] (either end
-- optional), how many are won / lost, and the won leads' revenue. The app
-- has called this since the leaderboard was moved to SQL, but the function
-- is missing from the live database (it was never in a migration file), so
-- every manager showed 0 there and the funnel filter emptied the list.
create or replace function public.leaderboard_stats(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_funnel text default null,
  p_stage_id uuid default null,
  p_tags text[] default null
)
returns table (owner_id uuid, total_leads bigint, won_leads bigint, lost_leads bigint, revenue numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select l.owner_id,
         count(*),
         count(*) filter (where s.is_won),
         count(*) filter (where s.is_lost),
         coalesce(sum(l.expected_revenue) filter (where s.is_won), 0)
  from public.leads l
  left join public.pipeline_stages s on s.id = l.stage_id
  where l.organization_id = public.current_user_org_id()
    and l.owner_id is not null
    and (p_from is null or l.created_at >= p_from)
    and (p_to is null or l.created_at <= p_to)
    and (p_funnel is null or coalesce(nullif(l.funnel, ''), 'Direct Sales') = p_funnel)
    and (p_stage_id is null or l.stage_id = p_stage_id)
    and (p_tags is null or l.tags && p_tags)
  group by l.owner_id;
$$;

revoke execute on function public.call_pickup_by_hour(timestamptz, timestamptz, uuid[], text) from anon, public;
revoke execute on function public.call_quality_by_day(timestamptz, int, int, text, uuid[], text) from anon, public;
revoke execute on function public.leaderboard_stats(timestamptz, timestamptz, text, uuid, text[]) from anon, public;
revoke execute on function public.period_call_summary(timestamptz, timestamptz, text, uuid[], text) from anon, public;
revoke execute on function public.period_lead_summary(timestamptz, timestamptz, timestamptz, timestamptz, text, uuid[], text) from anon, public;
revoke execute on function public.won_revenue_by_month(timestamptz, text, uuid[], text) from anon, public;
grant execute on function public.call_pickup_by_hour(timestamptz, timestamptz, uuid[], text) to authenticated;
grant execute on function public.call_quality_by_day(timestamptz, int, int, text, uuid[], text) to authenticated;
grant execute on function public.leaderboard_stats(timestamptz, timestamptz, text, uuid, text[]) to authenticated;
grant execute on function public.period_call_summary(timestamptz, timestamptz, text, uuid[], text) to authenticated;
grant execute on function public.period_lead_summary(timestamptz, timestamptz, timestamptz, timestamptz, text, uuid[], text) to authenticated;
grant execute on function public.won_revenue_by_month(timestamptz, text, uuid[], text) to authenticated;

notify pgrst, 'reload schema';
