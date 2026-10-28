-- Sales growth pack: Patok (stream), the speed-to-lead alarm, the lead
-- payments ledger, coaching tasks and the score/objection analytics.
-- Every statement is idempotent (if not exists / create or replace), so the
-- file can be run again safely. Nothing here deletes or rewrites data.

-- ---------------------------------------------------------------------
-- 1. Patok: which intake/cohort a lead belongs to (14.1, 14.2, ...),
--    next to the existing Kampaniya (leads.campaign). Funnels stay as the
--    company wants; these two fields filter and report inside any funnel.
-- ---------------------------------------------------------------------
alter table public.leads add column if not exists stream text;
create index if not exists leads_org_stream_idx
  on public.leads (organization_id, stream) where stream is not null;
create index if not exists leads_org_campaign_idx
  on public.leads (organization_id, campaign) where campaign is not null;

notify pgrst, 'reload schema';
