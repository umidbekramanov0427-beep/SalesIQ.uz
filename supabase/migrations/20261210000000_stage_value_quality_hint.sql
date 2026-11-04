-- Voronka sozlamalari: three properties of a funnel stage, set on the funnel
-- settings page (/funnels/settings) and used by analytics and the board.
--
--   stage_value   what reaching the stage means for the money:
--                 new (incoming lead), in_work (no sum yet), expected (sum
--                 expected), advance (prepayment), sale, refused.
--                 Null = derived from the stage (won -> sale, lost -> refused).
--   lead_quality  whether a lead in this stage counts as qualified or junk
--                 for ad analytics; null = not marked.
--   hint          what the manager should do in this stage, shown under the
--                 column title on the board.
-- Columns only; existing rows keep null (the old behaviour).

alter table public.pipeline_stages
  add column if not exists stage_value text,
  add column if not exists lead_quality text,
  add column if not exists hint text;

alter table public.pipeline_stages drop constraint if exists pipeline_stages_stage_value_check;
alter table public.pipeline_stages add constraint pipeline_stages_stage_value_check
  check (stage_value is null or stage_value in ('new', 'in_work', 'expected', 'advance', 'sale', 'refused'));

alter table public.pipeline_stages drop constraint if exists pipeline_stages_lead_quality_check;
alter table public.pipeline_stages add constraint pipeline_stages_lead_quality_check
  check (lead_quality is null or lead_quality in ('qualified', 'junk'));

alter table public.pipeline_stages drop constraint if exists pipeline_stages_hint_length;
alter table public.pipeline_stages add constraint pipeline_stages_hint_length
  check (hint is null or char_length(hint) <= 500);
