-- The previous migration (20260923030000) gave several new tables a
-- not-null organization_id but no auto-stamping trigger, unlike almost
-- every other client-insertable table in this schema (pipeline_stages,
-- leads, tasks, ...) -- those all use public.set_organization_id() so the
-- browser never has to pass organization_id itself (and can't accidentally
-- pass the wrong one). Missing it here would have made every insert from
-- the new Pipelines settings page / click-to-call / SMS UI fail outright
-- until the client code was rewritten to supply it manually.
drop trigger if exists set_org_id on public.pipelines;
create trigger set_org_id before insert on public.pipelines
  for each row execute function public.set_organization_id();

drop trigger if exists set_org_id on public.pipeline_stage_rules;
create trigger set_org_id before insert on public.pipeline_stage_rules
  for each row execute function public.set_organization_id();

drop trigger if exists set_org_id on public.lead_duplicate_flags;
create trigger set_org_id before insert on public.lead_duplicate_flags
  for each row execute function public.set_organization_id();

drop trigger if exists set_org_id on public.pbx_calls;
create trigger set_org_id before insert on public.pbx_calls
  for each row execute function public.set_organization_id();

drop trigger if exists set_org_id on public.sms_log;
create trigger set_org_id before insert on public.sms_log
  for each row execute function public.set_organization_id();

drop trigger if exists set_org_id on public.lead_sources;
create trigger set_org_id before insert on public.lead_sources
  for each row execute function public.set_organization_id();

drop trigger if exists set_org_id on public.web_forms;
create trigger set_org_id before insert on public.web_forms
  for each row execute function public.set_organization_id();

-- pipelines/pipeline_stage_rules also need updated_at to auto-refresh on
-- update, matching every other table that carries the column.
drop trigger if exists set_updated_at on public.pipelines;
create trigger set_updated_at before update on public.pipelines
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.pipeline_stage_rules;
create trigger set_updated_at before update on public.pipeline_stage_rules
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.org_telephony_credentials;
create trigger set_updated_at before update on public.org_telephony_credentials
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.pbx_calls;
create trigger set_updated_at before update on public.pbx_calls
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.lead_sources;
create trigger set_updated_at before update on public.lead_sources
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.web_forms;
create trigger set_updated_at before update on public.web_forms
  for each row execute function public.set_updated_at();
