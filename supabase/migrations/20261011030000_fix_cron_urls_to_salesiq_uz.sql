-- All four of the app's existing pg_cron jobs were scheduled against
-- https://salesos-elite-crm.lovable.app (the project's underlying Lovable
-- deployment URL, per README.md) rather than the confirmed real production
-- domain, salesiq.uz. cron.schedule() re-registers a job in place when one
-- with the same name already exists (same technique used by
-- 20260830160000_daily_report_cron_per_org_schedule.sql and
-- 20260821120000_amocrm_sync_cron_timeout_fix.sql), so re-running this is a
-- safe no-op once the URL is already correct -- nothing needs to be
-- unscheduled first.

select cron.schedule(
  'amocrm-auto-sync-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://salesiq.uz/integrations/amocrm/sync-all',
    headers := '{"content-type": "application/json", "x-cron-secret": "VSA_17u2QB5AV7nCuYoTHk3-dH-ydOJw07UBkiC5z3g"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 240000
  ) as request_id;
  $$
);

select cron.schedule(
  'telegram-daily-report-scheduler',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://salesiq.uz/telegram/send-daily-report',
    headers := '{"content-type": "application/json", "x-cron-secret": "VSA_17u2QB5AV7nCuYoTHk3-dH-ydOJw07UBkiC5z3g"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);

select cron.schedule(
  'audio-analysis-auto-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://salesiq.uz/audio-analytics/analyze-pending',
    headers := '{"content-type": "application/json", "x-cron-secret": "VSA_17u2QB5AV7nCuYoTHk3-dH-ydOJw07UBkiC5z3g"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 240000
  ) as request_id;
  $$
);

select cron.schedule(
  'fines-daily-compute-2100-tashkent',
  '0 16 * * *',
  $$
  select net.http_post(
    url := 'https://salesiq.uz/fines/compute',
    headers := '{"content-type": "application/json", "x-cron-secret": "VSA_17u2QB5AV7nCuYoTHk3-dH-ydOJw07UBkiC5z3g"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
