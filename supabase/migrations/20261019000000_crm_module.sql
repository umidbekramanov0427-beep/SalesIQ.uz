-- CRM module per company.
--
-- A company can use SalesIQ for analytics only (its CRM is amoCRM/Bitrix24,
-- synced in) or also as its CRM (own funnels, lead sources, telephony,
-- salesbots, triggers...). The platform owner switches the CRM part on or
-- off per company (organizations.crm_enabled, editable only by the platform
-- owner -- organizations_write already allows nobody else). Off means the
-- CRM settings are hidden in the app and no triggers / salesbots run.
--
-- Existing companies that already use CRM features (Master IQ, or any
-- triggers, salesbots, web forms or lead sources) keep them switched on.

alter table public.organizations
  add column if not exists crm_enabled boolean not null default false;

update public.organizations o
set crm_enabled = true
where not o.crm_enabled
  and (
    o.plan = 'master_iq'
    or exists (select 1 from public.automation_rules x where x.organization_id = o.id)
    or exists (select 1 from public.salesbots x where x.organization_id = o.id)
    or exists (select 1 from public.web_forms x where x.organization_id = o.id)
    or exists (select 1 from public.lead_sources x where x.organization_id = o.id)
  );

create or replace function public.fire_lead_automations(
  p_lead public.leads,
  p_trigger_type text,
  p_tag text default null,
  p_channel text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rule record;
  applied jsonb;
  err text;
  lead_json jsonb := to_jsonb(p_lead);
  lead_funnel text := coalesce(p_lead.funnel, 'Direct Sales');
begin
  -- CRM module off for this company: no triggers run at all.
  if not exists (
    select 1 from public.organizations o
    where o.id = p_lead.organization_id and o.crm_enabled
  ) then
    return;
  end if;

  for rule in
    select * from public.automation_rules r
    where r.enabled
      and r.organization_id = p_lead.organization_id
      and r.trigger_type = p_trigger_type
      and (r.funnel is null or r.funnel = lead_funnel)
      and (p_trigger_type not in ('stage_enter') or r.trigger_stage_id = p_lead.stage_id)
      and (p_trigger_type <> 'lead_created' or coalesce(r.trigger_source, '') = ''
           or coalesce(p_lead.source, '') ilike ('%' || r.trigger_source || '%'))
      and (p_trigger_type <> 'tag_added' or r.trigger_tag = p_tag)
      and (p_trigger_type <> 'message_received' or coalesce(r.trigger_channel, '') = ''
           or r.trigger_channel = p_channel)
    order by r.position, r.created_at
  loop
    if not public.automation_condition_matches(
      lead_json, rule.condition_field, rule.condition_operator, rule.condition_value
    ) then
      continue;
    end if;

    if coalesce(rule.delay_minutes, 0) > 0 then
      insert into public.automation_pending_runs (rule_id, lead_id, organization_id, run_at)
      values (rule.id, p_lead.id, p_lead.organization_id,
              now() + (rule.delay_minutes || ' minutes')::interval);
      continue;
    end if;

    applied := '[]'::jsonb;
    err := null;
    begin
      applied := public.apply_automation_actions(rule.actions, p_lead.id, p_lead.organization_id, rule.id);
    exception when others then
      err := sqlerrm;
    end;

    insert into public.automation_rule_runs (rule_id, lead_id, organization_id, actions_applied, error)
    values (rule.id, p_lead.id, p_lead.organization_id, applied, err);
  end loop;
end;
$$;

create or replace function public.process_due_automation_runs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pending record;
  rule record;
  lead_row record;
  applied jsonb;
  err text;
begin
  for pending in
    select * from public.automation_pending_runs
    where processed_at is null and run_at <= now()
    order by run_at
    limit 500
  loop
    update public.automation_pending_runs set processed_at = now() where id = pending.id;
    select * into rule from public.automation_rules where id = pending.rule_id;
    if rule is null or not rule.enabled then continue; end if;

    applied := '[]'::jsonb;
    err := null;
    begin
      applied := public.apply_automation_actions(rule.actions, pending.lead_id, pending.organization_id, rule.id);
    exception when others then
      err := sqlerrm;
    end;
    insert into public.automation_rule_runs (rule_id, lead_id, organization_id, actions_applied, error)
    values (rule.id, pending.lead_id, pending.organization_id, applied, err);
  end loop;

  for rule in
    select r.* from public.automation_rules r
    join public.organizations o on o.id = r.organization_id and o.crm_enabled
    where r.enabled and r.trigger_type = 'stage_stuck'
      and r.trigger_stage_id is not null and coalesce(r.trigger_after_minutes, 0) > 0
  loop
    for lead_row in
      select l.* from public.leads l
      where l.organization_id = rule.organization_id
        and l.stage_id = rule.trigger_stage_id
        and l.stage_changed_at <= now() - (rule.trigger_after_minutes || ' minutes')::interval
        and not exists (
          select 1 from public.automation_rule_runs rr
          where rr.rule_id = rule.id and rr.lead_id = l.id and rr.ran_at >= l.stage_changed_at
        )
      limit 200
    loop
      if not public.automation_condition_matches(
        to_jsonb(lead_row), rule.condition_field, rule.condition_operator, rule.condition_value
      ) then
        continue;
      end if;
      applied := '[]'::jsonb;
      err := null;
      begin
        applied := public.apply_automation_actions(rule.actions, lead_row.id, rule.organization_id, rule.id);
      exception when others then
        err := sqlerrm;
      end;
      insert into public.automation_rule_runs (rule_id, lead_id, organization_id, actions_applied, error)
      values (rule.id, lead_row.id, rule.organization_id, applied, err);
    end loop;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
