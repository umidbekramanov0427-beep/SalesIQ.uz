-- Platform-owner controls: phone verification through the Telegram bot,
-- freezing a company, pausing one integration of a company, and the visits
-- report (every sign-in session with what happened in it).
--
-- Every statement is idempotent (re-running is harmless) and nothing here
-- deletes or rewrites existing data.

------------------------------------------------------------------------
-- 1. profiles.phone_verified_at: set by the Telegram bot (server side)
--    when the user shares their own contact. A user can't mark their own
--    phone as verified, and changing the phone clears the mark.
------------------------------------------------------------------------
alter table public.profiles add column if not exists phone_verified_at timestamptz;

create or replace function public.guard_phone_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.phone is distinct from old.phone then
    new.phone_verified_at := null;
  else
    new.phone_verified_at := old.phone_verified_at;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_phone_verification() from public, anon, authenticated;

drop trigger if exists guard_phone_verification on public.profiles;
create trigger guard_phone_verification
  before update on public.profiles
  for each row execute function public.guard_phone_verification();

------------------------------------------------------------------------
-- 2. organizations.frozen_at / frozen_reason: the platform owner froze the
--    company (active = false at the same time). Unfreezing credits the
--    frozen days back to the trial or paid period (done by the server).
--    Only the platform owner can update organizations (existing policy).
------------------------------------------------------------------------
alter table public.organizations add column if not exists frozen_at timestamptz;
alter table public.organizations add column if not exists frozen_reason text;

------------------------------------------------------------------------
-- 3. Visits report. user_login_events already holds one row per browser
--    session; it gains the region, when the session was last active, and
--    failed sign-in attempts (kind = 'failed_login', no user yet).
------------------------------------------------------------------------
alter table public.user_login_events add column if not exists region text;
alter table public.user_login_events add column if not exists last_seen_at timestamptz;
alter table public.user_login_events add column if not exists kind text not null default 'session';
alter table public.user_login_events add column if not exists email_attempted text;
alter table public.user_login_events alter column user_id drop not null;

do $$
begin
  alter table public.user_login_events
    add constraint user_login_events_kind_check check (kind in ('session', 'failed_login'));
exception
  when duplicate_object then null;
end $$;

create index if not exists user_login_events_created_idx
  on public.user_login_events (created_at desc);
create index if not exists user_login_events_ip_failed_idx
  on public.user_login_events (ip, created_at desc)
  where kind = 'failed_login';

-- What happened inside a session: pages opened, actions that failed,
-- pages or features the user was not allowed to open. Successful data
-- changes are read from audit_logs instead of being stored twice.
-- Written and read only by the server (service role): RLS on, no policies.
create table if not exists public.user_session_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.user_login_events(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('page', 'action', 'failed', 'blocked')),
  label text not null,
  path text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_session_events_session_idx
  on public.user_session_events (session_id, created_at);

alter table public.user_session_events enable row level security;

------------------------------------------------------------------------
-- 4. integration_pauses: the platform owner paused one integration of a
--    company. Sync jobs, webhooks and senders check it and do nothing while
--    a row exists. The company's own admins can see that it is paused.
------------------------------------------------------------------------
create table if not exists public.integration_pauses (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('amocrm', 'bitrix24', 'telephony', 'sms', 'webhooks')),
  paused_at timestamptz not null default now(),
  paused_by uuid references public.profiles(id) on delete set null,
  reason text,
  primary key (organization_id, kind)
);

alter table public.integration_pauses enable row level security;

drop policy if exists integration_pauses_select on public.integration_pauses;
create policy integration_pauses_select on public.integration_pauses for select to authenticated
  using (organization_id = public.current_user_org_id());

notify pgrst, 'reload schema';
