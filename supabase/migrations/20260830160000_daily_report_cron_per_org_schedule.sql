-- The original cron fired /telegram/send-daily-report once at a single
-- fixed time (23:50 Tashkent) for every company, ignoring each org's own
-- "Yuborish vaqti" (send_time) setting entirely -- that field was purely
-- decorative. Reports (Telegram sends, the saved daily_report_history row,
-- and the Google Sheets push) now only actually fire once
-- src/lib/telegram-report.server.ts sees an org's own configured send_time
-- come around, so the cron needs to poll that endpoint often enough for
-- every org's time to be caught, not fire once a day itself.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'telegram-daily-report-2350-tashkent') then
    perform cron.unschedule('telegram-daily-report-2350-tashkent');
  end if;
end $$;

-- cron.schedule() updates the existing job in place when a job with this
-- name already exists, so re-running this migration is a safe no-op change.
select cron.schedule(
  'telegram-daily-report-scheduler',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://salesos-elite-crm.lovable.app/telegram/send-daily-report',
    headers := '{"content-type": "application/json", "x-cron-secret": "REPLACED_BY_PRIVATE_APP_CONFIG"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
