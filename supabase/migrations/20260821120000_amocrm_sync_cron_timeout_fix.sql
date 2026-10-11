-- Root cause of "avtomatik sinxronlash faol" showing but nothing ever
-- actually syncing: net.http_post()'s default timeout_milliseconds is
-- 5000 (5s), but syncLeadsFromAmo() paginates through every lead (250 at
-- a time, up to 800 pages) plus contacts/companies/tasks/call
-- notes/users/loss_reasons sequentially against the AmoCRM API -- for an
-- org with several thousand leads this reliably takes well over 5s, so
-- every single cron-triggered call timed out before the sync finished
-- (confirmed via net._http_response.error_msg: "Timeout of 5000 ms
-- reached" on every recent row, status_code always null).
--
-- Fix: reschedule the same job with a 4-minute pg_net timeout instead of
-- the 5s default -- long enough for a full sync, still comfortably under
-- the 5-minute interval between runs so two runs never overlap.
select cron.unschedule('amocrm-auto-sync-5min');

select cron.schedule(
  'amocrm-auto-sync-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://salesos-elite-crm.lovable.app/integrations/amocrm/sync-all',
    headers := '{"content-type": "application/json", "x-cron-secret": "REPLACED_BY_PRIVATE_APP_CONFIG"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 240000
  ) as request_id;
  $$
);
