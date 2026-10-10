-- The platform takes the work day as finished at the company's auto-close
-- time (org_general_settings.manager_report_hours.auto_close, e.g. 20:00
-- for a 19:00 work day -- set in the daily report window). A work session
-- still open by then is closed at exactly that time, so attendance and the
-- daily report agree on when work ended. Sessions started after that time
-- (late overtime) are closed at the end of their day.

create or replace function public.close_overdue_work_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with open_sessions as (
    select ws.id,
           ws.clock_in,
           coalesce(nullif(s.timezone, ''), 'Asia/Tashkent') as tz,
           coalesce(s.manager_report_hours->>'auto_close', '20:00') as auto_close
    from public.work_sessions ws
    join public.profiles p on p.id = ws.profile_id
    left join public.org_general_settings s on s.organization_id = p.organization_id
    where ws.clock_out is null
      and ws.clock_in < now()
  ),
  due as (
    select o.id,
           o.clock_in,
           -- that day's auto-close moment, in the company's time zone
           ((date_trunc('day', o.clock_in at time zone o.tz) + o.auto_close::time) at time zone o.tz) as close_at,
           ((date_trunc('day', o.clock_in at time zone o.tz) + interval '1 day') at time zone o.tz) as day_end
    from open_sessions o
  ),
  closing as (
    select d.id,
           case when d.clock_in < d.close_at then d.close_at else d.day_end end as clock_out
    from due d
  )
  update public.work_sessions ws
     set clock_out = c.clock_out
    from closing c
   where ws.id = c.id
     and c.clock_out <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.close_overdue_work_sessions() from public, anon, authenticated;

-- Every 5 minutes, straight in the database (no HTTP call, no secret).
do $$
begin
  perform cron.schedule(
    'work-sessions-auto-close-5min',
    '*/5 * * * *',
    'select public.close_overdue_work_sessions()'
  );
exception
  when undefined_table or invalid_schema_name or undefined_function then
    raise notice 'pg_cron not available; schedule close_overdue_work_sessions() manually';
end $$;

-- Close what is already overdue right away.
select public.close_overdue_work_sessions();
