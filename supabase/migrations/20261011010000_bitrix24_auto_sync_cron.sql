-- Schedules /integrations/bitrix24/sync-all to run every 5 minutes, the
-- exact same pattern as amocrm-auto-sync-5min
-- (20260813150000_amocrm_auto_sync_cron.sql) -- catches up any org whose
-- Bitrix24 event webhooks (see bitrix24Connect's event.bind registration)
-- were missed or never fired, so a connected org's data never drifts too
-- far even if the real-time push side has a gap.
--
-- IMPORTANT: same as the AmoCRM cron -- if your production URL isn't
-- https://salesos-elite-crm.lovable.app, edit the `url` below before
-- running, or fix it after with `select cron.alter_job(job_id, ...)`.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'bitrix24-auto-sync-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://salesos-elite-crm.lovable.app/integrations/bitrix24/sync-all',
    headers := '{"content-type": "application/json", "x-cron-secret": "VSA_17u2QB5AV7nCuYoTHk3-dH-ydOJw07UBkiC5z3g"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
