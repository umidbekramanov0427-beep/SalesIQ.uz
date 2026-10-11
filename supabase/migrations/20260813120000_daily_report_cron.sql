-- Schedules the existing /telegram/send-daily-report endpoint to actually
-- run every day, instead of just sitting there waiting to be called. Uses
-- Supabase's pg_cron + pg_net (the standard way to call an HTTP endpoint
-- on a schedule from Postgres) — no external scheduler needed.
--
-- IMPORTANT — two things to check after running this:
-- 1. The url below assumes the app is deployed at
--    https://salesos-elite-crm.lovable.app — if your real production URL
--    is different, edit the `url` value below before running, or run
--    `select cron.alter_job(job_id, ...)` afterward to fix it (find the
--    job id: `select jobid from cron.job where jobname =
--    'telegram-daily-report-2350-tashkent';`).
-- 2. Set an environment variable CRON_SECRET to the exact value below
--    (REPLACED_BY_PRIVATE_APP_CONFIG) in your hosting
--    platform's settings — /telegram/send-daily-report rejects any
--    request whose x-cron-secret header doesn't match it.
--
-- '50 18 * * *' = 18:50 UTC = 23:50 in Tashkent (UTC+5, no DST).
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'telegram-daily-report-2350-tashkent',
  '50 18 * * *',
  $$
  select net.http_post(
    url := 'https://salesos-elite-crm.lovable.app/telegram/send-daily-report',
    headers := '{"content-type": "application/json", "x-cron-secret": "REPLACED_BY_PRIVATE_APP_CONFIG"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
