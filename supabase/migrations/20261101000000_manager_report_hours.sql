-- Daily report working hours: the work day starts with the day's first call
-- in the CRM, and is taken as finished at a configurable time -- e.g. a
-- 19:00 work day is closed automatically at 20:00 and the report writes
-- 20:00 as the finish. Set in the report window by a super admin / ROP.

alter table public.org_general_settings
  add column if not exists manager_report_hours jsonb not null
    default '{"work_day_end": "19:00", "auto_close": "20:00"}'::jsonb;

create or replace function public.set_manager_report_hours(p_work_day_end text, p_auto_close text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_user_org_id();
begin
  if v_org is null
     or coalesce(public.current_user_role()::text, '') not in ('super_admin', 'rop', 'platform_owner') then
    raise exception 'forbidden';
  end if;
  if p_work_day_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or p_auto_close !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Vaqt SS:DD ko''rinishida bo''lishi kerak';
  end if;
  if p_auto_close < p_work_day_end then
    raise exception 'Avtomatik yakunlash vaqti ish kuni tugashidan oldin bo''lmasligi kerak';
  end if;
  update public.org_general_settings
     set manager_report_hours = jsonb_build_object('work_day_end', p_work_day_end, 'auto_close', p_auto_close)
   where organization_id = v_org;
  if not found then
    insert into public.org_general_settings (organization_id, manager_report_hours)
    values (v_org, jsonb_build_object('work_day_end', p_work_day_end, 'auto_close', p_auto_close));
  end if;
end;
$$;

create or replace function public.my_daily_report(p_funnel text, p_talk_seconds integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid := public.current_user_org_id();
  v_tz text;
  v_from timestamptz;
  v_to timestamptz;
  v_result jsonb;
  v_all boolean := coalesce(public.current_user_role()::text, '') in ('super_admin', 'rop', 'platform_owner');
begin
  if v_uid is null or v_org is null then
    return null;
  end if;
  select coalesce(nullif(s.timezone, ''), 'Asia/Tashkent') into v_tz
  from public.org_general_settings s where s.organization_id = v_org;
  v_tz := coalesce(v_tz, 'Asia/Tashkent');
  v_from := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  v_to := v_from + interval '1 day';

  with calls as (
    select p.created_at as at,
           case when p.status in ('answered', 'completed') then greatest(p.duration_seconds, 0) else 0 end as dur,
           p.status in ('answered', 'completed') and p.duration_seconds > 0 as answered,
           p.status = 'failed' as failed,
           coalesce(
             nullif(right(regexp_replace(
               case when p.direction = 'incoming' then coalesce(p.from_number, '') else p.to_number end,
               '\D', '', 'g'), 9), ''),
             p.lead_id::text) as who
    from public.pbx_calls p
    where p.organization_id = v_org
      and (v_all or p.initiated_by = v_uid)
      and p.created_at >= v_from and p.created_at < v_to
  ),
  c as (
    select count(*) filter (where not failed) as calls,
           count(*) filter (where answered) as answered,
           count(*) filter (where not answered and not failed) as missed,
           count(distinct who) filter (where not failed) as people_called,
           count(distinct who) filter (where answered and dur >= p_talk_seconds) as people_talked,
           coalesce(sum(dur) filter (where answered), 0) as talk_seconds,
           min(at) as first_call,
           max(at) as last_call
    from calls
  ),
  my_leads as (
    select l.id, l.created_at, l.stage_changed_at,
           coalesce(s.is_won, false) or coalesce(s.counts_as_won_override, false) as won
    from public.leads l
    left join public.pipeline_stages s on s.id = l.stage_id
    where l.organization_id = v_org
      and (v_all or l.owner_id = v_uid)
      and l.amocrm_id is null
      and l.bitrix24_deal_id is null
      and coalesce(nullif(l.funnel, ''), 'Direct Sales') = coalesce(nullif(p_funnel, ''), 'Direct Sales')
  ),
  ld as (
    select count(*) as leads_total,
           count(*) filter (where created_at >= v_from and created_at < v_to) as leads_new_today,
           count(*) filter (where won) as sales_total,
           count(*) filter (where won and stage_changed_at >= v_from and stage_changed_at < v_to) as sales_today
    from my_leads
  ),
  -- "Holat": the whole funnel's sales today, every manager's together.
  team as (
    select count(*) as sales_today_all
    from public.leads l
    join public.pipeline_stages s on s.id = l.stage_id
    where l.organization_id = v_org
      and l.amocrm_id is null
      and l.bitrix24_deal_id is null
      and coalesce(nullif(l.funnel, ''), 'Direct Sales') = coalesce(nullif(p_funnel, ''), 'Direct Sales')
      and (s.is_won or s.counts_as_won_override)
      and l.stage_changed_at >= v_from and l.stage_changed_at < v_to
  ),
  w as (
    select min(ws.clock_in) as work_start,
           case when bool_or(ws.clock_out is null) then null else max(ws.clock_out) end as work_end,
           bool_or(ws.clock_out is null) as working_now
    from public.work_sessions ws
    where ws.profile_id = v_uid
      and ws.clock_in >= v_from and ws.clock_in < v_to
  )
  select jsonb_build_object(
    'scope', case when v_all then 'team' else 'me' end,
    'timezone', v_tz,
    'day', to_char(now() at time zone v_tz, 'YYYY-MM-DD'),
    'name', (select full_name from public.profiles where id = v_uid),
    'template', (select manager_report_template from public.org_general_settings where organization_id = v_org),
    'work_day_end', coalesce((select manager_report_hours->>'work_day_end' from public.org_general_settings where organization_id = v_org), '19:00'),
    'auto_close', coalesce((select manager_report_hours->>'auto_close' from public.org_general_settings where organization_id = v_org), '20:00'),
    'calls', c.calls,
    'answered', c.answered,
    'missed', c.missed,
    'people_called', c.people_called,
    'people_talked', c.people_talked,
    'talk_seconds', c.talk_seconds,
    'first_call', c.first_call,
    'last_call', c.last_call,
    'leads_total', ld.leads_total,
    'leads_new_today', ld.leads_new_today,
    'sales_total', ld.sales_total,
    'sales_today', ld.sales_today,
    'sales_today_all', team.sales_today_all,
    'work_start', w.work_start,
    'work_end', w.work_end,
    'working_now', coalesce(w.working_now, false)
  ) into v_result
  from c, ld, team, w;
  return v_result;
end;
$$;

grant execute on function public.set_manager_report_hours(text, text) to authenticated;
grant execute on function public.my_daily_report(text, integer) to authenticated;

notify pgrst, 'reload schema';
