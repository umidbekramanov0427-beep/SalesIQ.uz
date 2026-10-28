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


-- ---------------------------------------------------------------------
-- 2. Speed to lead: a fresh lead nobody has called or written to. The
--    every-minute check (/crm/speed-to-lead) stamps the first contact and
--    remembers which alert it has sent (1 = manager at 5 min, 2 = head of
--    sales at 15 min), so each is sent once.
-- ---------------------------------------------------------------------
alter table public.leads add column if not exists first_contact_at timestamptz;
alter table public.leads add column if not exists speed_alert_level smallint not null default 0;
create index if not exists leads_speed_watch_idx
  on public.leads (created_at)
  where first_contact_at is null and speed_alert_level < 2
    and amocrm_id is null and bitrix24_deal_id is null;

do $$
begin
  perform cron.schedule(
    'speed-to-lead-every-minute',
    '* * * * *',
    $cron$select public.call_app_endpoint('/crm/speed-to-lead', 20000)$cron$
  );
exception
  when undefined_table or invalid_schema_name or undefined_function then
    raise notice 'pg_cron not available; schedule /crm/speed-to-lead every minute by hand';
end $$;

notify pgrst, 'reload schema';
