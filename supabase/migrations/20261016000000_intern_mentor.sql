-- Amaliyotchi (intern) mode + AI mentor.
--
-- An intern is a Sotuv menejeri with is_intern = true rather than a brand
-- new app_role value: every RLS policy, permission row and "own data only"
-- scope in the app already does the right thing for a rep, so an intern
-- inherits exactly that access without touching ~100 policies. The intern
-- part is the probation itself -- when it started, how long it lasts, and
-- where the mentor has got to.
--
-- current_day is stored (refreshed by the mentor on every greeting/check-in)
-- so SQL reports can read it directly; the app itself always recomputes it
-- live from internship_start_date, so a stale value is never shown.

alter table public.profiles
  add column if not exists is_intern boolean not null default false,
  add column if not exists internship_start_date date,
  add column if not exists internship_days integer not null default 14,
  add column if not exists current_day integer,
  add column if not exists onboarding_status jsonb not null default '{}'::jsonb,
  -- The intern's own onboarding Telegram group (the bot is added there and
  -- bound with "/mentor CODE"). The personal chat stays telegram_chat_id.
  add column if not exists intern_group_chat_id bigint,
  add column if not exists intern_group_link_code text,
  add column if not exists mentor_last_checkin_at timestamptz;

create unique index if not exists profiles_intern_group_link_code_idx
  on public.profiles(intern_group_link_code) where intern_group_link_code is not null;
create index if not exists profiles_intern_idx
  on public.profiles(organization_id) where is_intern;

-- Optional: pin a lesson to a specific day of the probation. Lessons left
-- unpinned are spread over the days automatically, in Sinfxona order.
alter table public.lessons
  add column if not exists intern_day integer;

-- Live day number for SQL reports (day 1 = the start date, Tashkent time).
create or replace function public.intern_current_day(p_start date)
returns integer
language sql
stable
as $$
  select case
    when p_start is null then null
    else greatest(1, (timezone('Asia/Tashkent', now())::date - p_start) + 1)
  end;
$$;

-- Every mentor <-> intern message, from the platform chat and from Telegram
-- (personal chat or the onboarding group), so both channels share one
-- conversation history. Written only by the server (service role).
create table if not exists public.intern_mentor_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intern_id uuid not null references public.profiles(id) on delete cascade,
  sender text not null check (sender in ('mentor', 'intern')),
  channel text not null default 'platform' check (channel in ('platform', 'telegram')),
  kind text not null default 'chat' check (kind in ('greeting', 'checkin', 'chat')),
  day integer,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists intern_mentor_messages_intern_idx
  on public.intern_mentor_messages(intern_id, created_at desc);

alter table public.intern_mentor_messages enable row level security;

-- The intern reads their own conversation; ROP/super_admin read every
-- intern conversation in their org (the "Amaliyotchilar" overview).
drop policy if exists "intern_mentor_messages_select" on public.intern_mentor_messages;
create policy "intern_mentor_messages_select" on public.intern_mentor_messages
  for select to authenticated
  using (
    intern_id = auth.uid()
    or (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  );

-- Mentor check-ins every 15 minutes (the route itself decides who is due:
-- work hours only, ~45 min apart, quieter when the intern isn't answering).
-- The job copies the URL host and x-cron-secret header from the existing
-- audio-analysis job instead of repeating the secret in this file; it is
-- skipped if that job doesn't exist on this database.
do $$
declare
  cmd text;
begin
  select command into cmd from cron.job where jobname = 'audio-analysis-auto-5min';
  if cmd is null then
    raise notice 'audio-analysis-auto-5min not found; schedule intern-mentor-checkins manually';
    return;
  end if;
  perform cron.schedule(
    'intern-mentor-checkins-15min',
    '*/15 * * * *',
    replace(cmd, '/audio-analytics/analyze-pending', '/intern-mentor/checkins')
  );
exception
  when undefined_table or invalid_schema_name then
    raise notice 'pg_cron not available; schedule intern-mentor-checkins manually';
end $$;
