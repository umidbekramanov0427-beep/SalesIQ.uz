-- Nazorat: Davomat (attendance) and Oylik (payroll) are removed for good.
--
-- 1. The company's working hours lived in attendance_rules.shifts[0]; they
--    move to org_work_schedule (Admin -> Ish vaqti), which the after-hours
--    auto-reply reads.
-- 2. The manager's daily report no longer reads work_sessions (it never
--    printed them -- the work day there starts with the first call).
-- 3. The automatic closing of open work sessions stops.
-- 4. The tables and the settings column go, with their rows:
--    work_sessions, call_logs, attendance_notes, payroll_schemes,
--    org_general_settings.attendance_rules / attendance_report_sent_on.

-- 1. working hours -> org_work_schedule
do $$
begin
  if to_regclass('public.org_work_schedule') is not null and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'org_general_settings'
      and column_name = 'attendance_rules'
  ) then
    insert into public.org_work_schedule (organization_id, start_time, end_time, work_days)
    select g.organization_id,
           (g.attendance_rules #>> '{shifts,0,start}')::time,
           (g.attendance_rules #>> '{shifts,0,end}')::time,
           coalesce(
             (select array_agg(d::smallint order by d::int)
                from jsonb_array_elements_text(g.attendance_rules #> '{shifts,0,days}') d
               where d ~ '^[1-7]$'),
             '{1,2,3,4,5}'::smallint[]
           )
      from public.org_general_settings g
     where coalesce(g.attendance_rules #>> '{shifts,0,start}', '') ~ '^\d{2}:\d{2}'
       and coalesce(g.attendance_rules #>> '{shifts,0,end}', '') ~ '^\d{2}:\d{2}'
    on conflict (organization_id) do update
      set start_time = excluded.start_time,
          end_time = excluded.end_time,
          work_days = excluded.work_days;
  end if;
end $$;

-- 2. the daily report without work_sessions
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
    'sales_today_all', team.sales_today_all
  ) into v_result
  from c, ld, team;
  return v_result;
end;
$$;

grant execute on function public.my_daily_report(text, integer) to authenticated;

-- 3. no more automatic closing of work sessions
do $$
begin
  perform cron.unschedule('work-sessions-auto-close-5min');
exception
  when others then null;
end $$;

drop function if exists public.close_overdue_work_sessions();

-- 4. the data
drop table if exists public.attendance_notes;
drop table if exists public.payroll_schemes;
drop table if exists public.work_sessions;
drop table if exists public.call_logs;

alter table public.org_general_settings
  drop column if exists attendance_rules,
  drop column if exists attendance_report_sent_on;

notify pgrst, 'reload schema';
