-- Call analytics for the phone widget. Every salesperson sees the whole
-- team's numbers (who's ahead, who's behind), so the totals are computed
-- here, security definer, scoped to the caller's own company -- the rows
-- themselves stay behind their usual RLS.
--
-- amocrm_calls.caller_id: who actually made the call (the amoCRM note's
-- author, matched by profiles.amocrm_user_id). Older rows have none and
-- fall back to whoever logged it by hand, then the lead's owner.

alter table public.amocrm_calls
  add column if not exists caller_id uuid references public.profiles(id) on delete set null;
create index if not exists amocrm_calls_org_occurred_idx
  on public.amocrm_calls(organization_id, occurred_at desc);

create or replace function public.call_stats(
  p_from timestamptz,
  p_to timestamptz,
  p_profiles uuid[] default null,
  p_direction text default null,
  p_tz text default 'Asia/Tashkent',
  p_talk_seconds integer default 30,
  p_ring_guess integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_user_org_id();
  v_result jsonb;
begin
  if v_org is null then
    return null;
  end if;

  with calls as (
    select coalesce(c.caller_id, c.created_by, l.owner_id) as profile_id,
           case when c.direction = 'in' then 'incoming' else 'outgoing' end as direction,
           c.occurred_at as at,
           greatest(c.duration_seconds, 0) as dur,
           c.duration_seconds > 0 as answered,
           -- amoCRM never sends ringing time for an unanswered call
           null::integer as ring,
           false as failed,
           -- the same person whether written +998 90 ... or 90 ...
           coalesce(nullif(right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 9), ''), c.lead_id::text) as who
    from public.amocrm_calls c
    left join public.leads l on l.id = c.lead_id
    where c.organization_id = v_org
      and c.occurred_at >= p_from and c.occurred_at < p_to
    union all
    select p.initiated_by,
           p.direction,
           p.created_at,
           case when p.status in ('answered', 'completed') then greatest(p.duration_seconds, 0) else 0 end,
           p.status in ('answered', 'completed') and p.duration_seconds > 0,
           case when p.status in ('answered', 'completed') then null else nullif(p.duration_seconds, 0) end,
           -- the PBX refused the call outright: an attempt, but no one was rung
           p.status = 'failed',
           coalesce(
             nullif(right(regexp_replace(
               case when p.direction = 'incoming' then coalesce(p.from_number, '') else p.to_number end,
               '\D', '', 'g'), 9), ''),
             p.lead_id::text)
    from public.pbx_calls p
    where p.organization_id = v_org
      and p.created_at >= p_from and p.created_at < p_to
  ),
  f as (
    select * from calls
    where (p_direction is null or direction = p_direction)
      and (p_profiles is null or profile_id = any(p_profiles))
  ),
  totals as (
    select count(*) as attempts,
           count(*) filter (where direction = 'outgoing') as outgoing,
           count(*) filter (where direction = 'incoming') as incoming,
           count(distinct who) as people,
           count(*) filter (where answered) as answered,
           count(*) filter (where answered and dur >= p_talk_seconds) as talked,
           count(*) filter (where not answered and not failed) as missed,
           count(*) filter (where failed) as failed,
           count(*) filter (where not answered and not failed and direction = 'incoming') as missed_incoming,
           coalesce(sum(dur) filter (where answered), 0) as talk_seconds,
           coalesce(sum(coalesce(ring, p_ring_guess)) filter (where not answered and not failed), 0) as missed_seconds,
           count(*) filter (where not answered and not failed and ring is null) as missed_estimated
    from f
  ),
  reps as (
    select profile_id,
           count(*) as attempts,
           count(*) filter (where direction = 'outgoing') as outgoing,
           count(*) filter (where direction = 'incoming') as incoming,
           count(distinct who) as people,
           count(*) filter (where answered) as answered,
           count(*) filter (where answered and dur >= p_talk_seconds) as talked,
           count(*) filter (where not answered and not failed) as missed,
           count(*) filter (where failed) as failed,
           coalesce(sum(dur) filter (where answered), 0) as talk_seconds,
           coalesce(sum(coalesce(ring, p_ring_guess)) filter (where not answered and not failed), 0) as missed_seconds
    from f
    group by profile_id
  ),
  hours as (
    select extract(hour from at at time zone p_tz)::int as hour,
           count(*) as attempts,
           count(*) filter (where answered) as answered
    from f where direction = 'outgoing' and not failed
    group by 1
  ),
  weekdays as (
    select extract(isodow from at at time zone p_tz)::int as day,
           count(*) as attempts,
           count(*) filter (where answered) as answered
    from f where direction = 'outgoing' and not failed
    group by 1
  ),
  days as (
    select (at at time zone p_tz)::date as day,
           count(*) as attempts,
           count(*) filter (where answered) as answered,
           coalesce(sum(dur) filter (where answered), 0) as talk_seconds
    from f
    group by 1
  )
  select jsonb_build_object(
    'totals', (select to_jsonb(totals) from totals),
    'reps', coalesce((select jsonb_agg(to_jsonb(reps)) from reps), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(to_jsonb(hours) order by hour) from hours), '[]'::jsonb),
    'weekdays', coalesce((select jsonb_agg(to_jsonb(weekdays) order by day) from weekdays), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(to_jsonb(days) order by day) from days), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.call_stats(timestamptz, timestamptz, uuid[], text, text, integer, integer) from public;
grant execute on function public.call_stats(timestamptz, timestamptz, uuid[], text, text, integer, integer) to authenticated;
