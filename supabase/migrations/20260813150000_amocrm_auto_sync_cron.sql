-- Schedules /integrations/amocrm/sync-all to run every 5 minutes, so
-- AmoCRM data refreshes automatically instead of requiring someone to
-- click "Sinxronlash" by hand. Reuses the same CRON_SECRET env var (and
-- pg_cron/pg_net extensions) already set up for the daily-report cron.
--
-- IMPORTANT: same as the daily-report cron — if your production URL isn't
-- https://salesos-elite-crm.lovable.app, edit the `url` below before
-- running, or fix it after with `select cron.alter_job(job_id, ...)`.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'amocrm-auto-sync-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://salesos-elite-crm.lovable.app/integrations/amocrm/sync-all',
    headers := '{"content-type": "application/json", "x-cron-secret": "REPLACED_BY_PRIVATE_APP_CONFIG"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
