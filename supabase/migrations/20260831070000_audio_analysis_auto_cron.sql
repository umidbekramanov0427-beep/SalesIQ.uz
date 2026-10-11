-- Root cause of "audio tahlil ishlamayapti / hisobot yozmayapti": AmoCRM
-- call sync (its own 5-minute cron, see 20260813150000) reliably pulls
-- recording_url into amocrm_calls, but nothing ever called Gemini/Whisper
-- on those recordings automatically -- analysis only ever ran from a human
-- clicking "Tahlil qilish" one call at a time on Audio Analytics. At real
-- call volume that's effectively never, so lead_quality_stage_id (and the
-- Lid sifati / Marketing / daily-report sections built on top of it) stayed
-- empty. This schedules /audio-analytics/analyze-pending, which finds calls
-- with a recording but no analysis yet and analyzes a batch of them.
--
-- Same shared-secret + pg_net pattern as the other two cron jobs (see
-- 20260807230000-ish daily-report cron and 20260813150000 amocrm-sync).
-- IMPORTANT: same caveat as those -- if your production URL isn't
-- https://salesos-elite-crm.lovable.app, edit the `url` below before
-- running, or fix it after with `select cron.alter_job(job_id, ...)`.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'audio-analysis-auto-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://salesos-elite-crm.lovable.app/audio-analytics/analyze-pending',
    headers := '{"content-type": "application/json", "x-cron-secret": "REPLACED_BY_PRIVATE_APP_CONFIG"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 240000
  ) as request_id;
  $$
);
