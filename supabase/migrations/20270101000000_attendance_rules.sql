-- Davomat qoidalari (src/lib/attendance-rules.ts): the office location and
-- radius for a Telegram check-in, allowed lateness, the automatic break,
-- shifts and who works which, and the evening report time. {} (the
-- default) means 09:00-18:00 Mon-Fri, 10 minutes grace, a 60-minute break
-- on days over 5 hours, report at 18:30. work_sessions remembers how a
-- person checked in (site button or Telegram with location) and where.
-- Adds columns only; nothing is deleted or rewritten.

alter table public.org_general_settings
  add column if not exists attendance_rules jsonb not null default '{}'::jsonb,
  add column if not exists attendance_report_sent_on date;

alter table public.work_sessions
  add column if not exists method text not null default 'web',
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists distance_m integer,
  add column if not exists out_method text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'work_sessions_method_check'
  ) then
    alter table public.work_sessions
      add constraint work_sessions_method_check
      check (method in ('web', 'telegram') and (out_method is null or out_method in ('web', 'telegram')));
  end if;
end $$;

create index if not exists work_sessions_org_day_idx
  on public.work_sessions (organization_id, clock_in desc);

notify pgrst, 'reload schema';
