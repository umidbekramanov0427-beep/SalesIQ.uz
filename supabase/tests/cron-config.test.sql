-- call_app_endpoint reads the secret from private.app_config; app roles
-- can't read that config or call the function.
begin;
insert into private.app_config (key, value) values ('cron_secret', 'S3CRET')
on conflict (key) do update set value = excluded.value;
select public.call_app_endpoint('/audio-analytics/analyze-pending', 240000);
do $$ begin
  assert (select headers->>'x-cron-secret' from net.calls order by ctid desc limit 1) = 'S3CRET', 'secret sent';
  assert (select url from net.calls order by ctid desc limit 1)
    = 'https://salesiq.uz/audio-analytics/analyze-pending', 'url built from app_base_url';
  assert not has_schema_privilege('authenticated', 'private', 'usage'), 'app users cannot see private';
  assert not has_function_privilege('authenticated', 'public.call_app_endpoint(text, integer)', 'execute'),
    'app users cannot call the endpoint function';
end $$;
rollback;
