-- Schedules /integrations/bitrix24/sync-all to run every 5 minutes, the
-- exact same pattern as amocrm-auto-sync-5min
-- (20260813150000_amocrm_auto_sync_cron.sql) -- catches up any org whose
-- Bitrix24 event webhooks (see bitrix24Connect's event.bind registration)
-- were missed or never fired, so a connected org's data never drifts too
-- far even if the real-time push side has a gap.
--
-- Uses the org's real custom domain (salesiq.uz), confirmed as this
-- project's actual production URL -- unlike the older AmoCRM/daily-report/
-- fines crons, which still point at the underlying salesos-elite-crm.
-- lovable.app address and may need the same fix (see the follow-up
-- migration/task for that).
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'bitrix24-auto-sync-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://salesiq.uz/integrations/bitrix24/sync-all',
    headers := '{"content-type": "application/json", "x-cron-secret": "REPLACED_BY_PRIVATE_APP_CONFIG"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
