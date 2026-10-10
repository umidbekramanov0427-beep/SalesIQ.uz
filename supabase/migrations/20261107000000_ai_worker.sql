-- AI worker (services/ai-worker): a call being analysed right now is marked
-- here, so the pg_cron tick and the worker never analyse (and pay for) the
-- same call twice. Cleared when the analysis finishes or fails; a mark older
-- than 10 minutes counts as abandoned.

alter table public.amocrm_calls
  add column if not exists analysis_started_at timestamptz;

-- The worker's queue query: calls with a recording and no analysis yet.
create index if not exists idx_amocrm_calls_analysis_queue
  on public.amocrm_calls (occurred_at)
  where recording_url is not null and analyzed_at is null;
