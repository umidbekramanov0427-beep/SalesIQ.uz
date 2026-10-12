-- Visits report retention: session events and sign-in sessions older than
-- 30 days are deleted every night at 03:17 (Tashkent 08:17), so the report
-- stays fast and personal data isn't kept longer than needed.
--
-- This deletes data on a schedule, so it ships as its own migration and is
-- applied only with the platform owner's separate confirmation.

create or replace function public.purge_old_session_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.user_session_events where created_at < now() - interval '30 days';
  delete from public.user_login_events where created_at < now() - interval '30 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.purge_old_session_events() from public, anon, authenticated;

do $$
begin
  perform cron.schedule(
    'purge-old-session-events-daily',
    '17 3 * * *',
    'select public.purge_old_session_events()'
  );
exception
  when undefined_table or invalid_schema_name or undefined_function then
    raise notice 'pg_cron not available; schedule purge_old_session_events() manually';
end $$;
