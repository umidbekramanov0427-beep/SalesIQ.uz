-- Self-hosted server: rotate the secret pg_cron sends to the app
-- (x-cron-secret) without anyone copying it by hand. The server makes a new
-- value, keeps it as CRON_SECRET and calls this once with the service key;
-- only service_role may run it.
create or replace function public.set_cron_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if p_secret is null or length(p_secret) < 32 then
    raise exception 'cron secret must be at least 32 characters';
  end if;
  update private.app_config set value = p_secret where key = 'cron_secret';
  if not found then
    insert into private.app_config (key, value) values ('cron_secret', p_secret);
  end if;
end;
$$;

revoke execute on function public.set_cron_secret(text) from public, anon, authenticated;
grant execute on function public.set_cron_secret(text) to service_role;

notify pgrst, 'reload schema';
