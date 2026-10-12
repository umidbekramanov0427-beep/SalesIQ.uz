-- Visits report, second round: the platform owner can close one sign-in
-- session, "online now" reads recent heartbeats, and the daily Telegram
-- digest of trial companies is sent once per day.

------------------------------------------------------------------------
-- 1. user_login_events: which Supabase auth session a visit is, and when
--    the platform owner closed it. The browser's heartbeat sees revoked_at
--    and signs out.
------------------------------------------------------------------------
alter table public.user_login_events
  add column if not exists auth_session_id uuid,
  add column if not exists revoked_at timestamptz;

create index if not exists user_login_events_last_seen_idx
  on public.user_login_events (last_seen_at desc)
  where kind = 'session';

create index if not exists user_login_events_user_idx
  on public.user_login_events (user_id, created_at desc);

------------------------------------------------------------------------
-- 2. Close a session: deletes the auth session (its refresh tokens go with
--    it), or every session of the person when the visit predates
--    auth_session_id. Server only (service role).
------------------------------------------------------------------------
create or replace function public.platform_revoke_auth_sessions(
  p_user uuid,
  p_auth_session uuid default null
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_user is null then
    return 0;
  end if;
  delete from auth.sessions
   where user_id = p_user
     and (p_auth_session is null or id = p_auth_session);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.platform_revoke_auth_sessions(uuid, uuid) from public, anon, authenticated;
grant execute on function public.platform_revoke_auth_sessions(uuid, uuid) to service_role;

------------------------------------------------------------------------
-- 3. One row per day the owner's trial digest went out, so two cron
--    ticks in the same window can't send it twice. Server only.
------------------------------------------------------------------------
create table if not exists public.platform_digest_log (
  digest_date date primary key,
  sent_at timestamptz not null default now()
);

alter table public.platform_digest_log enable row level security;
