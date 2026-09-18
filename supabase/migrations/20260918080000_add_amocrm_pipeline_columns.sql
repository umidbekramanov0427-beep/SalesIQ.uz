-- amocrm_pipeline_id (and amocrm_status_id) on pipeline_stages were
-- originally added ad hoc through the Supabase SQL Editor, never through a
-- tracked migration -- so every later file that assumes the column exists
-- (the unique-constraint fix, the mock-data cleanup, the funnel RPCs) has
-- been silently failing on any database that only ever had the tracked
-- migration history applied to it. This backfills both columns so those
-- files can succeed on a re-run.
alter table public.pipeline_stages
  add column if not exists amocrm_pipeline_id integer,
  add column if not exists amocrm_status_id integer;
