-- The pg_cron jobs used to carry the app's CRON_SECRET as a literal inside
-- their command text -- and therefore inside these migration files, i.e. in
-- git. From here on the secret lives only in the database, in a schema the
-- API never exposes, and every HTTP cron job calls the app through
-- public.call_app_endpoint(), which reads it at run time.
--
-- After running this file, set the values (use a NEW secret, and put the
-- same value into the app server's .env.server as CRON_SECRET):
--   insert into private.app_config (key, value) values
--     ('app_base_url', 'https://salesiq.uz'),
--     ('cron_secret', '<new secret>')
--   on conflict (key) do update set value = excluded.value, updated_at = now();

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
revoke all on private.app_config from public, anon, authenticated;

insert into private.app_config (key, value)
values ('app_base_url', 'https://salesiq.uz')
on conflict (key) do nothing;

-- POSTs to <app_base_url><p_path> with the x-cron-secret header, like the
-- old inline net.http_post calls did.
create or replace function public.call_app_endpoint(p_path text, p_timeout_ms integer default 5000)
returns bigint
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_base text;
  v_secret text;
begin
  select value into v_base from private.app_config where key = 'app_base_url';
  select value into v_secret from private.app_config where key = 'cron_secret';
  if v_base is null or v_secret is null then
    raise exception 'private.app_config needs app_base_url and cron_secret';
  end if;
  return net.http_post(
    url := rtrim(v_base, '/') || p_path,
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := p_timeout_ms
  );
end;
$$;

revoke all on function public.call_app_endpoint(text, integer) from public, anon, authenticated;

-- Rewrite every existing HTTP cron job (same name, same schedule, same path
-- and timeout) to go through call_app_endpoint, dropping the literal secret.
do $$
declare
  j record;
  v_path text;
  v_timeout integer;
begin
  for j in select jobname, schedule, command from cron.job where command like '%x-cron-secret%' loop
    v_path := substring(j.command from 'https?://[^/'']+(/[^''?]*)');
    v_timeout := coalesce(substring(j.command from 'timeout_milliseconds := (\d+)')::integer, 5000);
    if v_path is null then
      raise notice 'cron job % left unchanged: no URL found', j.jobname;
      continue;
    end if;
    perform cron.schedule(
      j.jobname,
      j.schedule,
      format('select public.call_app_endpoint(%L, %s)', v_path, v_timeout)
    );
  end loop;
exception
  when undefined_table or invalid_schema_name then
    raise notice 'pg_cron not available; nothing to reschedule';
end $$;
