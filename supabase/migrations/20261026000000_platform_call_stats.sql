-- Call analytics from the platform's own telephony only (pbx_calls) --
-- every call the PBX reports: clicked here, dialled from a desk phone,
-- incoming, missed. amoCRM's synced calls are no longer mixed in.
--
-- pbx_calls gains: error (why the PBX refused a call -- shown on
-- "Ulanmadi"), ring_seconds (how long an unanswered call rang) and
-- extension (the salesperson's internal number, e.g. 105).

alter table public.pbx_calls add column if not exists error text;
alter table public.pbx_calls add column if not exists ring_seconds integer;
alter table public.pbx_calls add column if not exists extension text;

-- One row per PBX call. Built only if no duplicates exist yet.
do $$
begin
  if not exists (
    select 1 from public.pbx_calls
    where external_call_id is not null
    group by organization_id, external_call_id having count(*) > 1
  ) then
    create unique index if not exists pbx_calls_org_external_uidx
      on public.pbx_calls(organization_id, external_call_id)
      where external_call_id is not null;
  end if;
end $$;

-- When OnlinePBX's call history was last pulled in.
alter table public.org_telephony_credentials
  add column if not exists history_synced_at timestamptz;

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
    select p.initiated_by as profile_id,
           p.direction,
           p.created_at as at,
           case when p.status in ('answered', 'completed') then greatest(p.duration_seconds, 0) else 0 end as dur,
           p.status in ('answered', 'completed') and p.duration_seconds > 0 as answered,
           p.ring_seconds as ring,
           -- the PBX refused the call outright: an attempt, but no one was rung
           p.status = 'failed' as failed,
           -- the same person whether written +998 90 ... or 90 ...
           coalesce(
             nullif(right(regexp_replace(
               case when p.direction = 'incoming' then coalesce(p.from_number, '') else p.to_number end,
               '\D', '', 'g'), 9), ''),
             p.lead_id::text) as who
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
