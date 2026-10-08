-- Dashboard / Reyting statistics computed in the database.
--
-- The funnel KPI cards, the per-manager ranking, the daily trend charts,
-- the revenue series and the tag list all used to download every lead of
-- the org into the browser and add them up there. These return the same
-- numbers already grouped: one row per (manager, funnel, stage[, day or
-- month][, recoverable]) with a count and the revenue sum, so the browser
-- gets a few hundred small rows instead of the whole leads table.
-- security invoker: the caller's own leads RLS still applies.

create or replace function public.lead_stats_cube(
  p_funnel text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_grain text default 'none', -- 'none' | 'day' | 'month' (bucket by created_at)
  p_tz text default 'UTC'
)
returns table (
  owner_id uuid,
  funnel text,
  stage_id uuid,
  period date,
  recoverable boolean,
  n bigint,
  revenue numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    l.owner_id,
    coalesce(nullif(l.funnel, ''), 'Direct Sales') as funnel,
    l.stage_id,
    case p_grain
      when 'day' then (l.created_at at time zone p_tz)::date
      when 'month' then date_trunc('month', l.created_at at time zone p_tz)::date
      else null
    end as period,
    l.recoverable,
    count(*) as n,
    coalesce(sum(l.expected_revenue), 0) as revenue
  from public.leads l
  where l.organization_id = public.current_user_org_id()
    and (p_funnel is null or coalesce(nullif(l.funnel, ''), 'Direct Sales') = p_funnel)
    and (p_from is null or l.created_at >= p_from)
    and (p_to is null or l.created_at < p_to)
  group by 1, 2, 3, 4, 5;
$$;

grant execute on function public.lead_stats_cube(text, timestamptz, timestamptz, text, text) to authenticated;

create or replace function public.lead_tag_counts(p_funnel text default null)
returns table (tag text, n bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select t.tag, count(*) as n
  from public.leads l
  cross join lateral unnest(l.tags) as t(tag)
  where l.organization_id = public.current_user_org_id()
    and (p_funnel is null or coalesce(nullif(l.funnel, ''), 'Direct Sales') = p_funnel)
  group by t.tag;
$$;

grant execute on function public.lead_tag_counts(text) to authenticated;

-- Lost leads per loss reason (dashboard "Yo'qotish sabablari").
create or replace function public.lead_loss_reasons(
  p_funnel text default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (owner_id uuid, reason text, n bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select l.owner_id, coalesce(nullif(btrim(l.loss_reason), ''), '—') as reason, count(*) as n
  from public.leads l
  join public.pipeline_stages s on s.id = l.stage_id and s.is_lost
  where l.organization_id = public.current_user_org_id()
    and (p_funnel is null or coalesce(nullif(l.funnel, ''), 'Direct Sales') = p_funnel)
    and (p_from is null or l.created_at >= p_from)
    and (p_to is null or l.created_at <= p_to)
  group by 1, 2;
$$;

grant execute on function public.lead_loss_reasons(text, timestamptz, timestamptz) to authenticated;

notify pgrst, 'reload schema';
