-- Background call analysis: remember why a call failed and stop retrying.
--
-- /audio-analytics/analyze-pending (every 5 minutes) picks calls with a
-- recording and no analysis. A call that always fails (broken file, too long
-- for the AI, dead link) stayed "pending" forever, so it was downloaded and
-- sent to the AI again every 5 minutes, and nobody could see why it failed.
-- Now the job records the error and gives up after 3 attempts; analysing the
-- call by hand still works and clears both.
alter table public.amocrm_calls
  add column if not exists analysis_error text,
  add column if not exists analysis_attempts integer not null default 0;

notify pgrst, 'reload schema';
